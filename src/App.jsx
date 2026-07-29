import { useEffect, useMemo, useRef, useState } from 'react'
import {
  READABLE_STATUSES,
  STATUS_META,
  TASK_WRITE_URL,
  fetchArticles,
  readSavedStatusMap,
  statusKeyFromValue,
  updateArticleStatus,
} from './sheets.js'

const SCORE_BY_STATUS = {
  read: 5,
  readLater: 2,
  notInterested: 3,
  unread: 0,
}

function HomeButton({ onClick, hidden = false }) {
  return (
    <button className={`home-button ${hidden ? 'is-hidden' : ''}`} type="button" onClick={onClick}>
      Home
    </button>
  )
}

function Hero({ onStart, articleCount }) {
  return (
    <section className="hero-screen" aria-labelledby="hero-title">
      <div className="hero-backdrop" aria-hidden="true">
        <span className="glow glow-one" />
        <span className="glow glow-two" />
        <span className="grid-fade" />
      </div>
      <div className="hero-copy">
        <p className="eyebrow">Substack reader</p>
        <h1 id="hero-title">Read the best cards first.</h1>
        <p className="hero-text">A cleaner reading board for your latest Substack finds, sorted newest first.</p>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={onStart}>Start reading</button>
          <p className="hero-meta">{articleCount} cards ready.</p>
        </div>
      </div>
    </section>
  )
}

function StatCard({ label, value, tone }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function Heatmap({ articles }) {
  const days = useMemo(() => {
    const grouped = new Map()
    articles.forEach((article) => {
      const key = article.discoveryDate || 'Unknown date'
      const day = grouped.get(key) || { date: key, total: 0, statuses: {} }
      day.total += 1
      day.statuses[article.statusKey] = (day.statuses[article.statusKey] || 0) + 1
      grouped.set(key, day)
    })
    return [...grouped.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [articles])

  return (
    <section className="panel analytics-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Decision heatmap</p>
          <h3>Daily status mix</h3>
        </div>
      </div>
      <div className="heatmap-grid" role="img" aria-label="Heatmap of article decisions by discovery date">
        {days.map((day) => (
          <div className="heatmap-row" key={day.date}>
            <span>{day.date}</span>
            <div className="heatmap-cells">
              {READABLE_STATUSES.map((status) => {
                const count = day.statuses[status.key] || 0
                return (
                  <div
                    key={`${day.date}-${status.key}`}
                    className={`heatmap-cell tone-${status.key}`}
                    style={{ '--cell-alpha': Math.max(0.16, count / Math.max(day.total, 1)) }}
                    title={`${day.date}: ${count} ${status.label}`}
                  >
                    {count}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StatusBars({ counts, total }) {
  return (
    <section className="panel analytics-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Status spread</p>
          <h3>Queue health</h3>
        </div>
      </div>
      <div className="status-bars">
        {READABLE_STATUSES.map((status) => {
          const value = counts[status.key] || 0
          const width = total ? `${(value / total) * 100}%` : '0%'
          return (
            <div className="status-row" key={status.key}>
              <div className="status-row-top">
                <span>{status.label}</span>
                <strong>{value}</strong>
              </div>
              <div className="status-track">
                <div className={`status-fill tone-${status.key}`} style={{ width }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DetailModal({ article, onClose, onAction }) {
  if (!article) return null

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="article-detail-title">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <article className="modal-card">
        <button className="close-button" type="button" onClick={onClose} aria-label="Close details">x</button>
        <p className="eyebrow">Summary</p>
        <h2 id="article-detail-title">{article.title}</h2>
        <div className="detail-meta">
          <span>{article.author}</span>
          <span>{article.discoveryDate}</span>
          <span>{article.published}</span>
          <span className={`status-pill tone-${article.statusKey}`}>{STATUS_META[article.statusKey].label}</span>
        </div>
        <p className="detail-summary">{article.summary}</p>
        <div className="tag-list">
          {article.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="detail-actions">
          <a className="primary-button link-button" href={article.link} target="_blank" rel="noreferrer">Open article</a>
          <button className="ghost-button" type="button" onClick={() => onAction(article, 'readLater')}>Read later</button>
          <button className="ghost-button" type="button" onClick={() => onAction(article, 'read')}>Read</button>
          <button className="ghost-button" type="button" onClick={() => onAction(article, 'notInterested')}>Not interested</button>
        </div>
      </article>
    </div>
  )
}

function ArticleCard({ article, revealed, onOpen, onStatus, onRevealStart, onRevealEnd }) {
  return (
    <article
      className={`reader-card ${revealed ? 'is-revealed' : ''}`}
      onPointerDown={onRevealStart}
      onPointerUp={onRevealEnd}
      onPointerCancel={onRevealEnd}
      onPointerLeave={onRevealEnd}
    >
      <div className="card-topline">
        <span>{article.discoveryDate}</span>
        <span className={`status-pill tone-${article.statusKey}`}>{STATUS_META[article.statusKey].label}</span>
      </div>
      <h2>{article.title}</h2>
      <p className="card-author">{article.author}</p>
      <div className="tag-list compact-tags">
        {article.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
      </div>

      {revealed && (
        <div className="hold-details">
          <p>{article.summary}</p>
          <div className="detail-meta inline-meta">
            <span>Published {article.published || 'Unknown'}</span>
            <span>{article.link ? 'Source available' : 'No source link'}</span>
          </div>
        </div>
      )}

      <div className="card-actions">
        <a
          className="article-link-button"
          href={article.link || '#'}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(event) => event.stopPropagation()}
          aria-disabled={!article.link}
        >
          <span className="article-link-icon" aria-hidden="true">{'\u2197'}</span>
          Read article
        </a>
        <button className="summary-button" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onOpen(article)}>Summary</button>
        <button className="ghost-button compact-button" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onStatus(article, 'readLater')}>Later</button>
        <button className="ghost-button compact-button" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onStatus(article, 'read')}>Read</button>
        <button className="ghost-button compact-button" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onStatus(article, 'notInterested')}>Skip</button>
      </div>
    </article>
  )
}

function EmptyDeck() {
  return (
    <section className="empty-deck panel">
      <p className="eyebrow">No cards</p>
      <h2>The reader is empty.</h2>
      <p>Check the sheet ID, sharing settings, and expected columns.</p>
    </section>
  )
}

export default function App() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [arenaOpen, setArenaOpen] = useState(false)
  const [detailArticle, setDetailArticle] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [cardRevealed, setCardRevealed] = useState(false)
  const [localStatusMap, setLocalStatusMap] = useState(readSavedStatusMap)
  const readerRef = useRef(null)
  const revealTimerRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')
      try {
        const next = await fetchArticles(controller.signal)
        setArticles(next)
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    window.localStorage.setItem('substack-reader-statuses', JSON.stringify(localStatusMap))
  }, [localStatusMap])

  const orderedArticles = useMemo(() => {
    return articles.map((article) => {
      const override = localStatusMap[article.id]
      const statusKey = override ? statusKeyFromValue(override) : article.statusKey
      return { ...article, statusKey, statusLabel: STATUS_META[statusKey].label }
    })
  }, [articles, localStatusMap])

  const activeArticle = orderedArticles[activeIndex] || null

  useEffect(() => {
    if (activeIndex >= orderedArticles.length) setActiveIndex(Math.max(0, orderedArticles.length - 1))
  }, [activeIndex, orderedArticles.length])

  const counts = useMemo(() => {
    return orderedArticles.reduce((accumulator, article) => {
      accumulator[article.statusKey] = (accumulator[article.statusKey] || 0) + 1
      return accumulator
    }, { unread: 0, readLater: 0, read: 0, notInterested: 0 })
  }, [orderedArticles])

  const score = useMemo(() => {
    return orderedArticles.reduce((sum, article) => sum + (SCORE_BY_STATUS[article.statusKey] || 0), 0)
  }, [orderedArticles])

  function moveCard(direction) {
    setCardRevealed(false)
    setActiveIndex((current) => Math.min(Math.max(current + direction, 0), Math.max(orderedArticles.length - 1, 0)))
  }

  function startReveal(event) {
    if (event.target.closest('button, a')) return
    window.clearTimeout(revealTimerRef.current)
    revealTimerRef.current = window.setTimeout(() => setCardRevealed(true), 320)
  }

  function endReveal() {
    window.clearTimeout(revealTimerRef.current)
    setCardRevealed(false)
  }

  async function persistDecision(article, nextStatusKey) {
    setLocalStatusMap((current) => ({ ...current, [article.id]: STATUS_META[nextStatusKey].label }))
    setNotice('')

    try {
      await updateArticleStatus(article, STATUS_META[nextStatusKey].label)
      setNotice(`${article.title} marked ${STATUS_META[nextStatusKey].label.toLowerCase()}.`)
    } catch (writeError) {
      setNotice(
        writeError.code === 'NO_WRITE_ENDPOINT'
          ? `Status saved locally. Set VITE_SUBSTACK_API_URL to sync "${article.title}" back to Google Sheets.`
          : `Saved locally, but Google Sheets did not confirm the update for "${article.title}".`
      )
    }
  }

  function startArena() {
    setArenaOpen(true)
    readerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function goHome() {
    setArenaOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <HomeButton onClick={goHome} hidden={!arenaOpen} />
      <main className="app-shell">
        <div className="viewport-stack">
          <Hero onStart={startArena} articleCount={orderedArticles.length} />

          <section className="reader-screen" aria-label="Substack reader" ref={readerRef}>
            <div className="reader-layout">
              <section className="cards-section">
                <div className="stage-header">
                  <div>
                    <p className="eyebrow">Latest cards</p>
                    <h2>Choose what deserves attention.</h2>
                  </div>
                  <div className="score-badge">
                    <span>Attention score</span>
                    <strong>{score}</strong>
                  </div>
                </div>

                {loading && <div className="panel loading-panel">Loading your Substack cards...</div>}
                {error && <div className="panel error-panel">{error}</div>}
                {!loading && !error && orderedArticles.length === 0 && <EmptyDeck />}
                {!loading && !error && activeArticle && (
                  <div className="reader-carousel">
                    <ArticleCard
                      article={activeArticle}
                      revealed={cardRevealed}
                      onOpen={setDetailArticle}
                      onStatus={persistDecision}
                      onRevealStart={startReveal}
                      onRevealEnd={endReveal}
                    />
                    <div className="carousel-controls" aria-label="Card navigation">
                      <button className="ghost-button" type="button" onClick={() => moveCard(-1)} disabled={activeIndex === 0}>Previous</button>
                      <span>{activeIndex + 1} / {orderedArticles.length}</span>
                      <button className="ghost-button" type="button" onClick={() => moveCard(1)} disabled={activeIndex >= orderedArticles.length - 1}>Next</button>
                    </div>
                  </div>
                )}
              </section>

              <aside className="arena-sidebar">
                <div className="stat-grid">
                  <StatCard label="Unread" value={counts.unread} tone="unread" />
                  <StatCard label="Read later" value={counts.readLater} tone="readLater" />
                  <StatCard label="Read" value={counts.read} tone="read" />
                  <StatCard label="Not interested" value={counts.notInterested} tone="notInterested" />
                </div>

                {notice && <div className="panel notice-panel">{notice}</div>}
                {!TASK_WRITE_URL && (
                  <div className="panel notice-panel muted-panel">
                    Status changes are working locally. Add `VITE_SUBSTACK_API_URL` after you deploy the Google Apps Script.
                  </div>
                )}

                <StatusBars counts={counts} total={orderedArticles.length} />
                <Heatmap articles={orderedArticles} />
              </aside>
            </div>
          </section>
        </div>
      </main>

      <DetailModal article={detailArticle} onClose={() => setDetailArticle(null)} onAction={persistDecision} />
    </>
  )
}
