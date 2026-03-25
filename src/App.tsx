import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db, firebaseReady, googleProvider } from "./firebase";

const MAX_DAYS = 10;
const todayKey = format(new Date(), "yyyy-MM-dd");
const THEME_KEY = "vocabulary-theme";

type SentenceEntry = {
  id: string;
  date: string;
  text: string;
  createdAt: number;
};

type WordItem = {
  id: string;
  word: string;
  meaning: string;
  entries: SentenceEntry[];
  createdAt: number;
};

type Category = {
  id: string;
  name: string;
  words: WordItem[];
  createdAt: number;
};

type VocabularyData = {
  categories: Category[];
};

const initialData: VocabularyData = {
  categories: [
    {
      id: crypto.randomUUID(),
      name: "General",
      createdAt: Date.now(),
      words: [],
    },
  ],
};

function sanitizeData(data: VocabularyData): VocabularyData {
  return {
    categories: (data.categories ?? []).map((c) => ({
      ...c,
      words: (c.words ?? []).map((w) => ({
        ...w,
        entries: (w.entries ?? []).slice(0, MAX_DAYS),
      })),
    })),
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authFallbackTriggered, setAuthFallbackTriggered] = useState(false);
  const [retryLoginLoading, setRetryLoginLoading] = useState(false);
  const isApplyingRemoteRef = useRef(false);
  const [data, setData] = useState<VocabularyData>({ categories: [] });
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState("");
  const [newWord, setNewWord] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [newSentence, setNewSentence] = useState("");
  const [status, setStatus] = useState("Ready");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" ? "dark" : "light";
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editingWordValue, setEditingWordValue] = useState("");
  const [editingMeaningValue, setEditingMeaningValue] = useState("");
  const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState(false);
  const [isWordDrawerOpen, setIsWordDrawerOpen] = useState(false);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [isWordFormOpen, setIsWordFormOpen] = useState(false);
  const [deleteSentenceModalOpen, setDeleteSentenceModalOpen] = useState(false);
  const [signOutModalOpen, setSignOutModalOpen] = useState(false);
  const [deleteSentenceTarget, setDeleteSentenceTarget] = useState<{
    categoryId: string;
    wordId: string;
  } | null>(null);

  const firebaseMisconfigured = !firebaseReady || !db;

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!deleteSentenceModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDeleteSentenceModalOpen(false);
        setDeleteSentenceTarget(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSentenceModalOpen]);

  useEffect(() => {
    if (!signOutModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSignOutModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [signOutModalOpen]);

  useEffect(() => {
    if (!firebaseReady || !auth) {
      setAuthLoading(false);
      return;
    }
    let didResolve = false;

    // Mobile iOS Safari'de nadiren `onAuthStateChanged` geç/hiç dönmeyebiliyor.
    // Kullanıcı arayüzünün sonsuza kadar "Signing in..." takılı kalmaması için fallback ekliyoruz.
    const timeoutId = window.setTimeout(() => {
      if (didResolve) return;
      console.warn("Auth fallback: onAuthStateChanged did not respond in time.");
      setAuthFallbackTriggered(true);
      setAuthLoading(false);
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      didResolve = true;
      window.clearTimeout(timeoutId);
      setUser(u);
      setAuthFallbackTriggered(false);
      setAuthLoading(false);
    });

    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  if (firebaseMisconfigured) {
    return (
      <div
        className={`page ${theme === "dark" ? "theme-dark" : "theme-light"}`}
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div className="card" style={{ width: "min(520px, 100%)", textAlign: "center" }}>
          <h2 style={{ margin: 0 }}>Firebase is not configured properly</h2>
          <p className="muted" style={{ marginTop: 12 }}>
            The app cannot run without a valid Firebase configuration.
          </p>
        </div>
      </div>
    );
  }

  /** Çıkışta ana içeriği gizlerken bellekteki kelime listesini de temizle (gizlilik + tutarlılık). */
  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    setData({ categories: [] });
    setActiveCategoryId(null);
    setActiveWordId(null);
    setNewCategory("");
    setNewWord("");
    setNewMeaning("");
    setNewSentence("");
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setEditingWordId(null);
    setEditingWordValue("");
    setEditingMeaningValue("");
    setIsCategoryDrawerOpen(false);
    setIsWordDrawerOpen(false);
    setIsCategoryFormOpen(false);
    setIsWordFormOpen(false);
    setDeleteSentenceModalOpen(false);
    setSignOutModalOpen(false);
    setDeleteSentenceTarget(null);
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    if (!db) return;

    let unsub: Unsubscribe | null = null;
    const ref = doc(db, "users", user.uid, "profile", "main");
    unsub = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const remoteVocabulary = snap.data()?.vocabulary as VocabularyData | undefined;
        const remoteData = sanitizeData(remoteVocabulary ?? initialData);
        isApplyingRemoteRef.current = true;
        setData(remoteData);
        console.log("Loaded from Firestore");
        setStatus("Synced from cloud");
      } else {
        try {
          await setDoc(ref, {
            vocabulary: initialData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          isApplyingRemoteRef.current = true;
          setData(sanitizeData(initialData));
          console.log("Loaded from Firestore");
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Unknown error while creating profile";
          console.error("Firestore init error:", e);
          setStatus(`Cloud init failed: ${msg}`);
        }
      }
    });
    return () => unsub?.();
  }, [user]);

  useEffect(() => {
    if (!isApplyingRemoteRef.current) return;
    isApplyingRemoteRef.current = false;
  }, [data]);

  const saveToFirestore = async (next: VocabularyData) => {
    if (!user || !db) return;
    try {
      const ref = doc(db, "users", user.uid, "profile", "main");
      await setDoc(ref, { vocabulary: next, updatedAt: serverTimestamp() }, { merge: true });
      console.log("Saved to Firestore");
      setStatus("Saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error while saving";
      console.error("Firestore save error:", e);
      setStatus(`Save failed: ${msg}`);
    }
  };

  const updateData = (updater: (prev: VocabularyData) => VocabularyData) => {
    setData((prev) => {
      const next = sanitizeData(updater(prev));
      // Remote snapshot ile gelen setData tekrar save'e dönmesin.
      if (!isApplyingRemoteRef.current) {
        void saveToFirestore(next);
      }
      return next;
    });
  };

  const activeCategory = useMemo(
    () => data.categories.find((c) => c.id === activeCategoryId) ?? null,
    [activeCategoryId, data.categories]
  );

  const activeWord = useMemo(
    () => activeCategory?.words.find((w) => w.id === activeWordId) ?? null,
    [activeCategory, activeWordId]
  );

  // Cloud'dan veri gelince `activeCategoryId` / `activeWordId` eski kalabiliyor.
  // Bu durumda ekleme/silme işlemleri yanlış category'e uygulanmadığı için
  // UI değişmiyor gibi görünebiliyor. Her data güncellemesinde ids'leri doğruluyoruz.
  useEffect(() => {
    if (data.categories.length === 0) {
      setActiveCategoryId(null);
      setActiveWordId(null);
      return;
    }

    const categoryExists =
      activeCategoryId && data.categories.some((c) => c.id === activeCategoryId);
    if (!categoryExists) {
      setActiveCategoryId(data.categories[0]?.id ?? null);
      setActiveWordId(null);
      return;
    }

    if (activeWordId && activeCategory?.words) {
      const wordExists = activeCategory.words.some((w) => w.id === activeWordId);
      if (!wordExists) setActiveWordId(null);
    }
  }, [data.categories, activeCategoryId, activeWordId, activeCategory]);

  const pendingByCategory = useMemo(() => {
    const map = new Map<string, number>();
    data.categories.forEach((category) => {
      const pending = category.words.filter((word) => {
        if (word.entries.length >= MAX_DAYS) return false;
        return !word.entries.some((entry) => entry.date === todayKey);
      }).length;
      map.set(category.id, pending);
    });
    return map;
  }, [data.categories]);
  const activePendingCount = activeCategoryId
    ? (pendingByCategory.get(activeCategoryId) ?? 0)
    : 0;

  const userName = user?.displayName?.trim() ?? "";

  const greetingBase = (() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 18) return "Good afternoon";
    if (hour >= 18 && hour <= 23) return "Good evening";
    return "Working late?";
  })();

  const greetingLine1 = userName
    ? greetingBase === "Working late?"
      ? `Working late, ${userName}`
      : `${greetingBase}, ${userName}`
    : greetingBase;

  // Daily motivation: "Today's Progress" based on words that are still in the 10-day cycle.
  // Y = words that still need today's sentence (they haven't finished 10 days yet)
  // X = those same words that already have today's sentence saved.
  const todayWordsTotal = data.categories.reduce((acc, category) => {
    const activeWords = category.words.filter((w) => w.entries.length < MAX_DAYS);
    return acc + activeWords.length;
  }, 0);

  const todayWordsDone = data.categories.reduce((acc, category) => {
    const doneWords = category.words.filter(
      (w) => w.entries.length < MAX_DAYS && w.entries.some((e) => e.date === todayKey)
    );
    return acc + doneWords.length;
  }, 0);

  const greetingLine2 = `Today's progress: ${todayWordsDone} / ${todayWordsTotal} words${
    todayWordsTotal > 0 && todayWordsDone === todayWordsTotal ? " 🎉" : ""
  }`;

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    const item: Category = {
      id: crypto.randomUUID(),
      name,
      words: [],
      createdAt: Date.now(),
    };
    updateData((prev) => ({ categories: [...prev.categories, item] }));
    setActiveCategoryId(item.id);
    setActiveWordId(null);
    setNewCategory("");
    setIsCategoryFormOpen(false);
  };

  const startCategoryEdit = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const saveCategoryEdit = () => {
    const nextName = editingCategoryName.trim();
    if (!editingCategoryId || !nextName) return;
    updateData((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === editingCategoryId ? { ...c, name: nextName } : c
      ),
    }));
    setEditingCategoryId(null);
    setEditingCategoryName("");
  };

  const deleteCategory = (id: string) => {
    if (!window.confirm("Delete this group with all words?")) return;
    updateData((prev) => ({
      categories: prev.categories.filter((c) => c.id !== id),
    }));
    if (activeCategoryId === id) {
      const next = data.categories.find((c) => c.id !== id);
      setActiveCategoryId(next?.id ?? null);
      setActiveWordId(null);
    }
  };

  const addWord = () => {
    const word = newWord.trim();
    const meaning = newMeaning.trim();
    if (!activeCategoryId || !word || !meaning) return;
    updateData((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === activeCategoryId
          ? {
              ...c,
              words: [
                ...c.words,
                {
                  id: crypto.randomUUID(),
                  word,
                  meaning,
                  entries: [],
                  createdAt: Date.now(),
                },
              ],
            }
          : c
      ),
    }));
    setNewWord("");
    setNewMeaning("");
    setIsWordFormOpen(false);
  };

  const startWordEdit = (word: WordItem) => {
    setEditingWordId(word.id);
    setEditingWordValue(word.word);
    setEditingMeaningValue(word.meaning);
  };

  const saveWordEdit = () => {
    const nextWord = editingWordValue.trim();
    const nextMeaning = editingMeaningValue.trim();
    if (!activeCategoryId || !editingWordId || !nextWord || !nextMeaning) return;
    updateData((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === activeCategoryId
          ? {
              ...c,
              words: c.words.map((w) =>
                w.id === editingWordId
                  ? { ...w, word: nextWord, meaning: nextMeaning }
                  : w
              ),
            }
          : c
      ),
    }));
    setEditingWordId(null);
    setEditingWordValue("");
    setEditingMeaningValue("");
  };

  const deleteWord = (wordId: string) => {
    if (!activeCategoryId) return;
    if (!window.confirm("Delete this word and all daily entries?")) return;
    updateData((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === activeCategoryId
          ? { ...c, words: c.words.filter((w) => w.id !== wordId) }
          : c
      ),
    }));
    if (activeWordId === wordId) setActiveWordId(null);
  };

  const addSentence = () => {
    const sentence = newSentence.trim();
    if (!activeCategoryId || !activeWordId || !sentence) return;
    updateData((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === activeCategoryId
          ? {
              ...c,
              words: c.words.map((w) => {
                if (w.id !== activeWordId || w.entries.length >= MAX_DAYS) return w;
                const hasToday = w.entries.some((e) => e.date === todayKey);
                if (hasToday) {
                  return {
                    ...w,
                    entries: w.entries.map((e) =>
                      e.date === todayKey
                        ? { ...e, text: sentence, createdAt: Date.now() }
                        : e
                    ),
                  };
                }
                return {
                  ...w,
                  entries: [
                    ...w.entries,
                    {
                      id: crypto.randomUUID(),
                      date: todayKey,
                      text: sentence,
                      createdAt: Date.now(),
                    },
                  ],
                };
              }),
            }
          : c
      ),
    }));
    setNewSentence("");
  };

  const requestDeleteLastSentence = () => {
    if (!activeCategoryId || !activeWordId) return;
    const word = activeCategory?.words.find((ww) => ww.id === activeWordId);
    if (!word || word.entries.length === 0) return;

    setDeleteSentenceTarget({ categoryId: activeCategoryId, wordId: activeWordId });
    setDeleteSentenceModalOpen(true);
  };

  const performDeleteLastSentence = () => {
    if (!deleteSentenceTarget) return;

    updateData((prev) => ({
      categories: prev.categories.map((c) => {
        if (c.id !== deleteSentenceTarget.categoryId) return c;
        return {
          ...c,
          words: c.words.map((w) => {
            if (w.id !== deleteSentenceTarget.wordId) return w;
            if (w.entries.length === 0) return w;
            return { ...w, entries: w.entries.slice(0, -1) };
          }),
        };
      }),
    }));

    setStatus("Deleted");
    setDeleteSentenceModalOpen(false);
    setDeleteSentenceTarget(null);
  };

  const cancelDeleteLastSentence = () => {
    setDeleteSentenceModalOpen(false);
    setDeleteSentenceTarget(null);
  };

  const signIn = async () => {
    if (!firebaseReady || !auth) return;
    await signInWithPopup(auth, googleProvider);
    setStatus("Signed in with Google");
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
    setStatus("Signed out");
  };

  const requestSignOut = () => {
    setSignOutModalOpen(true);
  };

  const cancelSignOut = () => {
    setSignOutModalOpen(false);
  };

  const confirmSignOut = async () => {
    await logout();
    setSignOutModalOpen(false);
  };

  const showMainApp = Boolean(user && firebaseReady && !authLoading);

  if (!showMainApp) {
    return (
      <div
        className={`page landing-page ${theme === "dark" ? "theme-dark" : "theme-light"}`}
      >
        <header className="topbar landing-topbar">
          <div className="topbar-title landing-hero-brand">
            <h1 className="landing-hero-title">
              Vocabulary Master <span className="landing-sparkle" aria-hidden="true">✨</span>
            </h1>
            <p className="landing-slogan muted">
              Build your vocabulary, one word at a time.
            </p>
          </div>
          <button
            type="button"
            className="btn ghost theme-toggle-btn"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {theme === "dark" ? "☀️" : "🌙"}
            </span>
            <span className="theme-toggle-text">
              {theme === "dark" ? "Light" : "Dark"}
            </span>
          </button>
        </header>

        <main className="landing-main">
          {authLoading ? (
            <p className="muted landing-lead">Signing in…</p>
          ) : !firebaseReady ? (
            <div className="landing-card card landing-card-elevated">
              <p className="landing-lead">
                Firebase is not configured. Add your <code>.env.local</code> values
                (see <code>.env.example</code>) and restart the dev server.
              </p>
            </div>
          ) : (
            <div className="landing-card card landing-card-elevated empty-state-card">
              <p className="muted landing-lead-secondary">
                Improve your English naturally, one word at a time.
              </p>
              <p className="landing-challenge">
                Practice each word with a 10-day sentence challenge.
              </p>
              <ul className="landing-features" aria-label="What you can do">
                <li className="landing-feature">
                  <span className="landing-feature-icon" aria-hidden="true">
                    📘
                  </span>
                  <span>Save new words</span>
                </li>
                <li className="landing-feature">
                  <span className="landing-feature-icon" aria-hidden="true">
                    ✍️
                  </span>
                  <span>Write daily sentences</span>
                </li>
                <li className="landing-feature">
                  <span className="landing-feature-icon" aria-hidden="true">
                    📈
                  </span>
                  <span>Track your progress</span>
                </li>
              </ul>
              <div className="landing-cta-wrap">
                <button
                  type="button"
                  className="btn landing-signin btn-landing-cta"
                  onClick={signIn}
                >
                  Get started with Google
                </button>
              </div>
              {authFallbackTriggered && !user ? (
                <div style={{ marginTop: 10, textAlign: "center" }}>
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                    Having trouble signing in? Try again.
                  </p>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ marginTop: 8, width: "100%", maxWidth: 260 }}
                    disabled={retryLoginLoading}
                    aria-busy={retryLoginLoading}
                    onClick={async () => {
                      setRetryLoginLoading(true);
                      try {
                        await signIn();
                      } finally {
                        setRetryLoginLoading(false);
                      }
                    }}
                  >
                    {retryLoginLoading ? "Retrying..." : "Retry login"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
          <footer className="site-footer-built landing-page-credit">
            <p className="site-credit-line">built by Ogün Özmalkoç</p>
            <a
              className="site-credit-link"
              href="https://github.com/ogunozmalkoc"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className={`page ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <header className="topbar">
        <div className="topbar-title">
          <h1>Vocabulary Master <span aria-hidden="true">✨</span></h1>
          {user ? (
            <div className="app-greeting">
              <p className="muted app-greeting-primary">{greetingLine1}</p>
              <p className="muted app-greeting-secondary">{greetingLine2}</p>
            </div>
          ) : null}
        </div>
        <div className="auth-box">
          <button
            type="button"
            className="btn ghost theme-toggle-btn top-action-btn"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {theme === "dark" ? "☀️" : "🌙"}
            </span>
            <span className="theme-toggle-text">
              {theme === "dark" ? "Light" : "Dark"}
            </span>
          </button>
          {user ? (
            <>
              <button className="btn ghost top-action-btn" onClick={requestSignOut}>
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="quick-nav">
        <button className="btn ghost icon-btn" onClick={() => setIsCategoryDrawerOpen(true)}>
          ☰ Groups
        </button>
        <button
          className="btn ghost icon-btn"
          onClick={() => setIsWordDrawerOpen(true)}
          disabled={!activeCategory}
        >
          ☰ Words {activePendingCount > 0 ? `(${activePendingCount})` : ""}
        </button>
      </div>

      <div className="single-grid">
        <section className={activeWord ? "card editor-card" : "editor-card editor-card-empty"}>
          {activeWord ? (
            <>
              <div className="word-head">
                <div className="title text-overflow">{activeWord.word}</div>
                <div className="muted text-overflow">{activeWord.meaning}</div>
                <div className="progress-indicator" aria-label={`Progress: ${activeWord.entries.length} / ${MAX_DAYS} days`}>
                  <div className="progress-text">
                    Progress: {activeWord.entries.length} / {MAX_DAYS} days
                  </div>
                  <div className="progress-bar" aria-hidden="true">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(1, activeWord.entries.length / MAX_DAYS) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <textarea
                value={newSentence}
                onChange={(e) => setNewSentence(e.target.value)}
                placeholder="Write today's sentence with this word..."
                disabled={activeWord.entries.length >= MAX_DAYS}
              />
              <button
                className="btn"
                onClick={addSentence}
                disabled={activeWord.entries.length >= MAX_DAYS}
              >
                {activeWord.entries.some((e) => e.date === todayKey)
                  ? "Update today's sentence"
                  : "Save today's sentence"}
              </button>

              <div className="entries">
                {Array.from({ length: MAX_DAYS }, (_, i) => {
                  const entry = activeWord.entries[i];
                  const lastFilledIndex = activeWord.entries.length - 1;
                  return (
                    <div key={i} className={`entry ${entry ? "filled" : ""}`}>
                      <div className="entry-head">
                        <span>Day {i + 1}</span>
                        {entry && i === lastFilledIndex && (
                          <button
                            type="button"
                            className="entry-delete"
                            aria-label={`Delete Day ${i + 1} sentence`}
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDeleteLastSentence();
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <p>{entry ? entry.text : "Not written yet."}</p>
                      {entry && <small>{entry.date}</small>}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="landing-card card landing-card-elevated empty-state-card">
              <p className="muted landing-lead-secondary">
                Improve your English naturally, one word at a time.
              </p>
              <p className="landing-challenge">
                Practice each word with a 10-day sentence challenge.
              </p>
              <ul className="landing-features" aria-label="What you can do">
                <li className="landing-feature">
                  <span className="landing-feature-icon" aria-hidden="true">
                    📘
                  </span>
                  <span>Save new words</span>
                </li>
                <li className="landing-feature">
                  <span className="landing-feature-icon" aria-hidden="true">
                    ✍️
                  </span>
                  <span>Write daily sentences</span>
                </li>
                <li className="landing-feature">
                  <span className="landing-feature-icon" aria-hidden="true">
                    📈
                  </span>
                  <span>Track your progress</span>
                </li>
              </ul>
            </div>
          )}
        </section>

        <aside className="card desktop-words-panel">
          <div className="panel-head">
            <h2>Words</h2>
            {activePendingCount > 0 && <strong className="badge">{activePendingCount}</strong>}
          </div>
          <p className="muted">
            {activePendingCount > 0
              ? `${activePendingCount} words still need today's sentence.`
              : "All selected words have today's sentence."}
          </p>
          <div className="list">
            {activeCategory?.words.map((w) => {
              const hasToday = w.entries.some((e) => e.date === todayKey);
              return (
                <button
                  key={w.id}
                  className={`item ${activeWordId === w.id ? "active" : ""}`}
                  onClick={() => setActiveWordId(w.id)}
                >
                  <div className="text-overflow bold">{w.word}</div>
                  <div className="badge-row">
                    <small>
                      {w.entries.length}/{MAX_DAYS} days
                    </small>
                    {!hasToday && w.entries.length < MAX_DAYS && <strong className="badge">!</strong>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      <div
        className={`overlay ${isCategoryDrawerOpen || isWordDrawerOpen ? "show" : ""}`}
        onClick={() => {
          setIsCategoryDrawerOpen(false);
          setIsWordDrawerOpen(false);
        }}
      />

      <aside className={`drawer ${isCategoryDrawerOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <h2>Groups</h2>
          <button className="action-btn" onClick={() => setIsCategoryDrawerOpen(false)}>
            Close
          </button>
        </div>
        <div className="list">
          {data.categories.map((c) => (
            <div
              key={c.id}
              className={`item ${activeCategoryId === c.id ? "active" : ""}`}
              onClick={() => {
                setActiveCategoryId(c.id);
                setActiveWordId(null);
                setIsCategoryDrawerOpen(false);
              }}
            >
              <div className="select-btn">
                {editingCategoryId === c.id ? (
                  <input
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    placeholder="Group name"
                  />
                ) : (
                  <span className="text-overflow">{c.name}</span>
                )}
              </div>
              <span className="badge-row">
                <small>{c.words.length}</small>
                {(pendingByCategory.get(c.id) ?? 0) > 0 && (
                  <strong className="badge">{pendingByCategory.get(c.id)}</strong>
                )}
              </span>
              <div className="actions">
                {editingCategoryId === c.id ? (
                  <>
                    <button
                      className="action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveCategoryEdit();
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategoryId(null);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        startCategoryEdit(c);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="action-btn danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCategory(c.id);
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <button className="btn secondary" onClick={() => setIsCategoryFormOpen((v) => !v)}>
          {isCategoryFormOpen ? "Hide add form" : "+ Add group"}
        </button>
        {isCategoryFormOpen && (
          <div className="stack">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New group"
            />
            <button className="btn secondary" onClick={addCategory}>
              Save group
            </button>
          </div>
        )}
      </aside>

      <aside className={`drawer right ${isWordDrawerOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <h2>Words</h2>
          <button className="action-btn" onClick={() => setIsWordDrawerOpen(false)}>
            Close
          </button>
        </div>
        <div className="list">
          {activeCategory?.words.map((w) => {
            const done = w.entries.length;
            const hasToday = w.entries.some((e) => e.date === todayKey);
            const needsToday = done < MAX_DAYS && !hasToday;
            return (
              <div
                key={w.id}
                className={`item ${activeWordId === w.id ? "active" : ""}`}
                onClick={() => {
                  setActiveWordId(w.id);
                  setIsWordDrawerOpen(false);
                }}
              >
                <div className="select-btn">
                  {editingWordId === w.id ? (
                    <div className="stack">
                      <input
                        value={editingWordValue}
                        onChange={(e) => setEditingWordValue(e.target.value)}
                        placeholder="Word"
                      />
                      <input
                        value={editingMeaningValue}
                        onChange={(e) => setEditingMeaningValue(e.target.value)}
                        placeholder="Meaning"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="text-overflow bold">{w.word}</div>
                    </>
                  )}
                </div>
                <div className="progress">
                  {needsToday && (
                    <span className="pending-dot" aria-hidden="true" />
                  )}
                  {done}/{MAX_DAYS} days
                </div>
                <div className="actions">
                  {editingWordId === w.id ? (
                    <>
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveWordEdit();
                        }}
                      >
                        Save
                      </button>
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingWordId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          startWordEdit(w);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="action-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWord(w.id);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          className="btn secondary"
          onClick={() => setIsWordFormOpen((v) => !v)}
          disabled={!activeCategory}
        >
          {isWordFormOpen ? "Hide add form" : "+ Add word"}
        </button>
        {isWordFormOpen && (
          <div className="stack">
            <input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="Word"
            />
            <input
              value={newMeaning}
              onChange={(e) => setNewMeaning(e.target.value)}
              placeholder="Short meaning (to get something)"
            />
            <button className="btn secondary" onClick={addWord}>
              Save word
            </button>
          </div>
        )}
      </aside>

      {deleteSentenceModalOpen && deleteSentenceTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={cancelDeleteLastSentence}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-sentence-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-sentence-title" className="modal-title">
              Delete latest sentence?
            </h3>
            <p className="modal-text">
              This will delete the most recently saved sentence for the selected
              word. Days will shift back by one.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={cancelDeleteLastSentence}>
                Cancel
              </button>
              <button className="btn danger" onClick={performDeleteLastSentence}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {signOutModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={cancelSignOut}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signout-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="signout-modal-title" className="modal-title">
              Are you sure you want to sign out?
            </h3>
            <p className="modal-text">
              You will need to sign in again to continue using the app.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={cancelSignOut}>
                Cancel
              </button>
              <button className="btn danger" onClick={confirmSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* status metni ekranda görünmesin diye footer boş bırakılıyor, ama değer aria-label içinde tutuluyor. */}
      <footer className="footer" aria-live="polite" aria-label={status}>
        <div className="site-footer-built">
          <span className="site-credit-line">built by Ogün Özmalkoç</span>
          <a
            className="site-credit-link"
            href="https://github.com/ogunozmalkoc"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
