;; ShadowFeed Registry - Provider registration & staking on Stacks
;; Providers stake STX as quality guarantee. Stake can be slashed for bad data.

;; ============================================
;; Constants
;; ============================================

(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_NOT_AUTHORIZED (err u100))
(define-constant ERR_ALREADY_REGISTERED (err u101))
(define-constant ERR_NOT_REGISTERED (err u102))
(define-constant ERR_INSUFFICIENT_STAKE (err u103))
(define-constant ERR_FEED_EXISTS (err u104))
(define-constant ERR_FEED_NOT_FOUND (err u105))
(define-constant ERR_INVALID_PRICE (err u106))
(define-constant ERR_SLASH_TOO_HIGH (err u107))

(define-constant MIN_STAKE u50000000) ;; 50 STX minimum stake (in microSTX)
(define-constant PROTOCOL_FEE_BPS u500) ;; 5% protocol fee (500 basis points)
(define-constant MAX_SLASH_BPS u5000) ;; Max 50% slash per incident

;; ============================================
;; Data Maps
;; ============================================

;; Provider registry: address -> provider info
(define-map providers
  { address: principal }
  {
    stake: uint,
    total-queries: uint,
    total-earned: uint,
    reputation-score: uint,
    registered-at: uint,
    is-active: bool
  }
)

;; Feed registry: (provider, feed-id) -> feed info
(define-map feeds
  { provider: principal, feed-id: (string-ascii 64) }
  {
    price-microstx: uint,
    description: (string-utf8 256),
    category: (string-ascii 32),
    total-queries: uint,
    is-active: bool
  }
)

;; Protocol treasury balance
(define-data-var protocol-treasury uint u0)
(define-data-var total-providers uint u0)
(define-data-var total-feeds uint u0)

;; ============================================
;; Read-Only Functions
;; ============================================

(define-read-only (get-provider (address principal))
  (map-get? providers { address: address })
)

(define-read-only (get-feed (provider principal) (feed-id (string-ascii 64)))
  (map-get? feeds { provider: provider, feed-id: feed-id })
)

(define-read-only (get-protocol-stats)
  (ok {
    treasury: (var-get protocol-treasury),
    total-providers: (var-get total-providers),
    total-feeds: (var-get total-feeds),
    min-stake: MIN_STAKE,
    protocol-fee-bps: PROTOCOL_FEE_BPS
  })
)

(define-read-only (is-provider-active (address principal))
  (match (map-get? providers { address: address })
    provider (get is-active provider)
    false
  )
)

;; ============================================
;; Public Functions - Provider Management
;; ============================================

;; Register as a data provider with STX stake
(define-public (register-provider (stake-amount uint))
  (begin
    (asserts! (>= stake-amount MIN_STAKE) ERR_INSUFFICIENT_STAKE)
    (asserts! (is-none (map-get? providers { address: tx-sender })) ERR_ALREADY_REGISTERED)

    ;; Transfer stake to contract
    (try! (stx-transfer? stake-amount tx-sender (as-contract tx-sender)))

    ;; Register provider
    (map-set providers
      { address: tx-sender }
      {
        stake: stake-amount,
        total-queries: u0,
        total-earned: u0,
        reputation-score: u50,
        registered-at: block-height,
        is-active: true
      }
    )

    (var-set total-providers (+ (var-get total-providers) u1))
    (ok true)
  )
)

;; Add more stake
(define-public (add-stake (amount uint))
  (let (
    (provider (unwrap! (map-get? providers { address: tx-sender }) ERR_NOT_REGISTERED))
  )
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set providers
      { address: tx-sender }
      (merge provider { stake: (+ (get stake provider) amount) })
    )
    (ok true)
  )
)

;; Register a new data feed
(define-public (register-feed
  (feed-id (string-ascii 64))
  (price-microstx uint)
  (description (string-utf8 256))
  (category (string-ascii 32))
)
  (begin
    (asserts! (is-some (map-get? providers { address: tx-sender })) ERR_NOT_REGISTERED)
    (asserts! (> price-microstx u0) ERR_INVALID_PRICE)
    (asserts! (is-none (map-get? feeds { provider: tx-sender, feed-id: feed-id })) ERR_FEED_EXISTS)

    (map-set feeds
      { provider: tx-sender, feed-id: feed-id }
      {
        price-microstx: price-microstx,
        description: description,
        category: category,
        total-queries: u0,
        is-active: true
      }
    )

    (var-set total-feeds (+ (var-get total-feeds) u1))
    (ok true)
  )
)

;; Record a query (called by provider after serving data)
(define-public (record-query (feed-id (string-ascii 64)) (payment-amount uint))
  (let (
    (provider (unwrap! (map-get? providers { address: tx-sender }) ERR_NOT_REGISTERED))
    (feed (unwrap! (map-get? feeds { provider: tx-sender, feed-id: feed-id }) ERR_FEED_NOT_FOUND))
    (protocol-fee (/ (* payment-amount PROTOCOL_FEE_BPS) u10000))
    (provider-earning (- payment-amount protocol-fee))
  )
    ;; Update provider stats
    (map-set providers
      { address: tx-sender }
      (merge provider {
        total-queries: (+ (get total-queries provider) u1),
        total-earned: (+ (get total-earned provider) provider-earning)
      })
    )

    ;; Update feed stats
    (map-set feeds
      { provider: tx-sender, feed-id: feed-id }
      (merge feed {
        total-queries: (+ (get total-queries feed) u1)
      })
    )

    ;; Add to protocol treasury
    (var-set protocol-treasury (+ (var-get protocol-treasury) protocol-fee))

    (ok { provider-earned: provider-earning, protocol-fee: protocol-fee })
  )
)

;; ============================================
;; Admin Functions - Slash & Governance
;; ============================================

;; Slash a provider's stake for bad data (admin only)
(define-public (slash-provider (provider-address principal) (slash-bps uint))
  (let (
    (provider (unwrap! (map-get? providers { address: provider-address }) ERR_NOT_REGISTERED))
    (slash-amount (/ (* (get stake provider) slash-bps) u10000))
  )
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (asserts! (<= slash-bps MAX_SLASH_BPS) ERR_SLASH_TOO_HIGH)

    ;; Reduce stake
    (map-set providers
      { address: provider-address }
      (merge provider {
        stake: (- (get stake provider) slash-amount),
        reputation-score: (if (> (get reputation-score provider) u10)
          (- (get reputation-score provider) u10)
          u0
        )
      })
    )

    ;; Slashed amount goes to protocol treasury
    (var-set protocol-treasury (+ (var-get protocol-treasury) slash-amount))

    (ok { slashed: slash-amount, remaining-stake: (- (get stake provider) slash-amount) })
  )
)

;; Deactivate a provider (admin only)
(define-public (deactivate-provider (provider-address principal))
  (let (
    (provider (unwrap! (map-get? providers { address: provider-address }) ERR_NOT_REGISTERED))
  )
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (map-set providers
      { address: provider-address }
      (merge provider { is-active: false })
    )
    (ok true)
  )
)

;; Withdraw protocol fees (admin only)
(define-public (withdraw-treasury (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (asserts! (<= amount (var-get protocol-treasury)) ERR_INSUFFICIENT_STAKE)
    (try! (as-contract (stx-transfer? amount tx-sender recipient)))
    (var-set protocol-treasury (- (var-get protocol-treasury) amount))
    (ok amount)
  )
)
