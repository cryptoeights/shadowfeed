;; ShadowFeed Registry v2 - Provider registration and staking on Stacks

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_NOT_AUTHORIZED (err u100))
(define-constant ERR_ALREADY_REGISTERED (err u101))
(define-constant ERR_NOT_REGISTERED (err u102))
(define-constant ERR_INSUFFICIENT_STAKE (err u103))
(define-constant ERR_FEED_EXISTS (err u104))
(define-constant ERR_FEED_NOT_FOUND (err u105))
(define-constant ERR_INVALID_PRICE (err u106))

(define-constant MIN_STAKE u50000000) ;; 50 STX in microSTX

;; Data Maps
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

(define-map feeds
  { provider: principal, feed-id: (string-ascii 64) }
  {
    price-microstx: uint,
    description: (string-ascii 256),
    category: (string-ascii 32),
    total-queries: uint,
    is-active: bool
  }
)

(define-data-var total-providers uint u0)
(define-data-var total-feeds uint u0)

;; Read-Only
(define-read-only (get-provider (address principal))
  (map-get? providers { address: address })
)

(define-read-only (get-feed (provider principal) (feed-id (string-ascii 64)))
  (map-get? feeds { provider: provider, feed-id: feed-id })
)

(define-read-only (get-protocol-stats)
  (ok {
    total-providers: (var-get total-providers),
    total-feeds: (var-get total-feeds),
    min-stake: MIN_STAKE
  })
)

(define-read-only (is-provider-active (address principal))
  (match (map-get? providers { address: address })
    provider (get is-active provider)
    false
  )
)

;; Public Functions

(define-public (register-provider (stake-amount uint))
  (begin
    (asserts! (>= stake-amount MIN_STAKE) ERR_INSUFFICIENT_STAKE)
    (asserts! (is-none (map-get? providers { address: tx-sender })) ERR_ALREADY_REGISTERED)
    (try! (stx-transfer? stake-amount tx-sender (as-contract tx-sender)))
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

(define-public (register-feed
  (feed-id (string-ascii 64))
  (price-microstx uint)
  (description (string-ascii 256))
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

(define-public (record-query (feed-id (string-ascii 64)) (payment-amount uint))
  (let (
    (provider (unwrap! (map-get? providers { address: tx-sender }) ERR_NOT_REGISTERED))
    (feed (unwrap! (map-get? feeds { provider: tx-sender, feed-id: feed-id }) ERR_FEED_NOT_FOUND))
  )
    (map-set providers
      { address: tx-sender }
      (merge provider {
        total-queries: (+ (get total-queries provider) u1),
        total-earned: (+ (get total-earned provider) payment-amount)
      })
    )
    (map-set feeds
      { provider: tx-sender, feed-id: feed-id }
      (merge feed {
        total-queries: (+ (get total-queries feed) u1)
      })
    )
    (ok true)
  )
)

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
