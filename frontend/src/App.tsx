import {
  createSignal,
  createEffect,
  onMount,
  For,
  Show,
} from "solid-js";
import {
  FaSolidUser,
  FaSolidRobot,
  FaSolidComment,
  FaSolidRetweet,
  FaSolidHeart,
  FaSolidShare,
  FaSolidEllipsis,
  FaSolidPen,
  FaSolidTrash,
} from "solid-icons/fa";
import { FiCheckCircle, FiSearch } from "solid-icons/fi";

const MAX_CHAR_LIMIT = 280;
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL;

const getAuthToken = () => {
  const token = localStorage.getItem("authToken");
  return token && token !== "undefined" ? token : null;
};
const setAuthToken = (token: string) => localStorage.setItem("authToken", token);
const clearAuthToken = () => localStorage.removeItem("authToken");
const authHeader = (useApiKey = false) => ({
  Authorization: `Bearer ${
    useApiKey
      ? import.meta.env.VITE_TWITTER_CLONE_API_KEY
      : getAuthToken()
  }`,
  "Content-Type": "application/json",
});

export default function App() {
  const [theme, setTheme] = createSignal("light");
  const [command, setCommand] = createSignal("");
  const [history, setHistory] = createSignal<string[]>([]);
  const [isPosting, setIsPosting] = createSignal(false);
  const [generatedTweet, setGeneratedTweet] = createSignal<string | null>(null);
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [messageBox, setMessageBox] = createSignal<
    { message: string; type: "info" | "error" | "success" } | null
  >(null);
  const [showAuthModal, setShowAuthModal] = createSignal(false);
  const [isLoginMode, setIsLoginMode] = createSignal(true);
  const [authUsername, setAuthUsername] = createSignal("");
  const [authPassword, setAuthPassword] = createSignal("");
  const [loggedInUser, setLoggedInUser] = createSignal<string | null>(null);
  const [lastTweetId, setLastTweetId] = createSignal<string | null>(null);
  const [showTweetFeedback, setShowTweetFeedback] = createSignal(false);
  const [tweets, setTweets] = createSignal<any[]>([]);
  const [searchTerm, setSearchTerm] = createSignal("");
  const [generatedTweets, setGeneratedTweets] = createSignal<
    { id: number; text: string; posted: boolean }[]
  >([]);
  const [apiError, setApiError] = createSignal<string | null>(null);
  const [myTweets, setMyTweets] = createSignal([]);
  const [isTyping, setIsTyping] = createSignal(false);

  const handleLogout = () => {
    clearAuthToken();
    setLoggedInUser(null);
    localStorage.removeItem("authToken");
    localStorage.removeItem("loggedInUser");
    setTweets([]);
    setMyTweets([]);
    setGeneratedTweets([]);
    setHistory([]);
    setGeneratedTweet(null);
    setMessageBox({ message: "Logged out successfully", type: "info" });
  };

  const addToHistory = (line: string) => {
    setHistory((prev) => [...prev, line]);
  };

  const showMessageBox = (
    message: string,
    type: "info" | "error" | "success"
  ) => {
    setMessageBox({ message, type });
    if (type === "error") setApiError(message);
  };

  const closeMessageBox = () => {
    setMessageBox(null);
    setApiError(null);
  };

  const handleDirectPost = async (content: string, isPublic: boolean = true) => {
    if (!content.trim()) {
      showMessageBox("Cannot post empty tweet", "error");
      return;
    }

    setIsPosting(true);
    const isPublicClone = window.location.hostname.includes("twitter-clone-ui.pages.dev");

    try {
      let res;

      if (isPublicClone) {
        res = await fetch(`${BACKEND_URL}/public-post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, posted: true }),
        });
      } else {
        res = await fetch(`${BACKEND_URL}/direct-post`, {
          method: "POST",
          headers: authHeader(false),
          body: JSON.stringify({ content, posted: isPublic }),
        });
      }

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      const newTweet = {
        ...data.tweet,
        text: data.tweet.content || data.tweet.text,
      };

      if (!isPublicClone) {
        const publicRes = await fetch("https://twitterclone-server-2xz2.onrender.com/post_tweet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": import.meta.env.VITE_TWITTER_CLONE_API_KEY,
          },
          body: JSON.stringify({
            username: loggedInUser() || "guest",
            text: content,
          }),
        });

        if (!publicRes.ok) {
          console.warn("Public clone post failed:", await publicRes.text());
        }
      }

      addToHistory(`🤖 AI: Posted: "${newTweet.text}"`);
      setTweets((prev) => [newTweet, ...prev]);
      setMyTweets((prev) => [newTweet, ...prev]);
      setGeneratedTweet(null);
      setShowTweetFeedback(true);
      setLastTweetId(data.tweet.id);
      setGeneratedTweets((prev) =>
        prev.map((t) => (t.text === content ? { ...t, posted: true } : t))
      );
    } catch (err: any) {
      showMessageBox(err.message || "Post failed", "error");
    } finally {
      setIsPosting(false);
    }
  };

  const speak = () => {
    if (!("webkitSpeechRecognition" in window)) {
      showMessageBox("Speech recognition not supported.", "error");
      return;
    }
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () =>
      showMessageBox("Listening... speak your tweet.", "info");
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setCommand(transcript);
      closeMessageBox();
    };
    recognition.onerror = (e: any) => {
      closeMessageBox();
      showMessageBox(`Speech recognition error: ${e.error}`, "error");
    };

    recognition.start();
  };

  const toggleTheme = () => {
    const next = theme() === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  };

  const fetchTweets = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/public-tweets`);
      const data = await res.json();
      setTweets(data);
    } catch (error: any) {
      showMessageBox(`Network error: ${error.message}`, "error");
      setTweets([]);
    }
  };

  const fetchMyTweets = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/tweets`, {
        headers: authHeader(false),
      });

      if (!res.ok) throw new Error("Unauthorized or failed to fetch");

      const data = await res.json();
      setMyTweets(data);
    } catch (err) {
      clearAuthToken();
      setLoggedInUser(null);
      setMessageBox({ type: "error", message: "Login required to view your tweets." });
    }
  };

  const generateTweet = async (topic: string) => {
    if (!topic.trim()) return;

    addToHistory(`👤 You: ${topic}`);
    setIsTyping(true);
    setIsGenerating(true);

    try {
      const res = await fetch(`${BACKEND_URL}/generate`, {
        method: "POST",
        headers: authHeader(false),
        body: JSON.stringify({ topic }),
      });

      if (res.status === 401) {
        clearAuthToken();
        setLoggedInUser(null);
        setShowAuthModal(true);
        throw new Error("Session expired. Please log in again.");
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Generation failed");
      }

      const data = await res.json();
      setGeneratedTweet(data.content);
      addToHistory(`🤖 AI: ${data.content}`);
      setGeneratedTweets((prev) => [
        ...prev,
        { id: Date.now(), text: data.content, posted: false },
      ]);
    } catch (err: any) {
      showMessageBox(err.message || "Generation failed", "error");
    } finally {
      setIsGenerating(false);
      setIsTyping(false);
    }
  };

  const handleAuthSubmit = async (e: Event) => {
    e.preventDefault();
    try {
      const endpoint = isLoginMode() ? "/login" : "/signup";
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsername(),
          password: authPassword(),
        }),
      });

      if (!res.ok) throw new Error("Login failed");

      const data = await res.json();
      setAuthToken(data.access_token);
      localStorage.setItem("authToken", data.access_token);
      localStorage.setItem("loggedInUser", authUsername());
      setLoggedInUser(authUsername());
      setShowAuthModal(false);
    } catch (err) {
      setMessageBox({ type: "error", message: "Authentication failed" });
    }
  };

  const postGeneratedTweet = async (id: number) => {
    const tweet = generatedTweets().find((t) => t.id === id);
    if (tweet) {
      await handleDirectPost(tweet.text, true);
      setGeneratedTweets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, posted: true } : t))
      );
    }
  };

  const deleteGeneratedTweet = (id: number) => {
    setGeneratedTweets((prev) => prev.filter((t) => t.id !== id));
  };

  const editGeneratedTweet = (id: number, newText: string) => {
    setGeneratedTweets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text: newText } : t))
    );
  };

  createEffect(() => {
    const saved = localStorage.getItem("generatedTweets");
    if (saved) setGeneratedTweets(JSON.parse(saved));
  });

  createEffect(() => {
    localStorage.setItem("generatedTweets", JSON.stringify(generatedTweets()));
  });

  createEffect(() => {
    localStorage.setItem(
      "draftTweets",
      JSON.stringify(generatedTweets().filter((t) => !t.posted))
    );
  });

  onMount(() => {
    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);
    document.documentElement.classList.toggle("dark", savedTheme === "dark");

    const token = getAuthToken();
    const user = localStorage.getItem("loggedInUser");

    if (token && user) {
      setLoggedInUser(user);
      fetchMyTweets();
    } else {
      setLoggedInUser(null);
    }

    fetchTweets();

    const savedDrafts = localStorage.getItem("draftTweets");
    if (savedDrafts) {
      setGeneratedTweets((prev) => [
        ...prev.filter((t) => t.posted),
        ...JSON.parse(savedDrafts),
      ]);
    }
  });
  const ErrorDisplay = () => {
    return (
      <Show when={apiError()}>
        <div class="fixed bottom-4 right-4 bg-red-500 text-white p-4 rounded-lg shadow-lg z-50 max-w-xs animate-fade-in">
          <div class="flex justify-between items-center">
            <span class="text-sm">{apiError()}</span>
            <button 
              onClick={closeMessageBox}
              class="ml-4 text-white hover:text-gray-200 focus:outline-none"
              aria-label="Close error message"
            >
              &times;
            </button>
          </div>
        </div>
      </Show>
    );
  };

  return (
    <div class="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-200 dark:from-gray-900 dark:to-black transition-all duration-500 p-4">
      {/* Header and Theme Toggle */}
      <div class="fixed top-4 right-4 z-50 flex items-center space-x-3 backdrop-blur-sm bg-white/30 dark:bg-gray-800/30 rounded-full p-2 shadow-lg transition-all duration-300">
        <a
          href="https://twitter-clone-ui.pages.dev/"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center justify-center h-10 w-10 bg-blue-500 rounded-full shadow-md hover:scale-110 transition-transform duration-200"
          aria-label="Go to Twitter Clone UI"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="white"
            class="h-6 w-6"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.261 8.761 11.088h-6.23l-4.93-6.188-5.637 6.188H.474l7.604-8.857L0 2.25h6.685l4.634 5.908L18.244 2.25zm-1.157 17.51h1.533L7.75 4.126H6.28l10.807 15.634z"/>
          </svg>
        </a>

        {loggedInUser() ? (
          <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500 text-white font-semibold text-sm shadow-lg">
            <FaSolidUser class="text-white" />
            <span>{loggedInUser()}</span>
            <button
              onClick={handleLogout}
              class="ml-2 px-2 py-1 bg-green-600 rounded-full hover:bg-green-700 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowAuthModal(true); setIsLoginMode(true); }}
            class="relative flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-800 transition-all duration-200 group overflow-hidden"
          >
            <FaSolidUser class="text-white group-hover:scale-110 transition-transform duration-200" />
            <span class="relative z-10">Login</span>
          </button>
        )}

        <button
          onClick={toggleTheme}
          class="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-700 text-white text-sm font-semibold hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-800 transition-all duration-200"
        >
          {theme() === "light" ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
              Dark Mode
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.459 4.293a1 1 0 01.707.293l2 2a1 1 0 01-1.414 1.414l-2-2a1 1 0 01-.293-.707zm-4.243-2.828a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414l2 2a1 1 0 010 1.414zM4 10a1 1 0 01-1 1H2a1 1 0 110-2h1a1 1 0 011 1zm3.293 4.293a1 1 0 01.707 0l2 2a1 1 0 01-1.414 1.414l-2-2a1 1 0 010-1.414zM10 18a1 1 0 01-1 1v1a1 1 0 112 0v-1a1 1 0 01-1-1zm-4.293-4.293a1 1 0 010-1.414l-2-2a1 1 0 111.414-1.414l2 2a1 1 0 01-1.414 1.414z" clip-rule="evenodd" />
              </svg>
              Light Mode
            </>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div class="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-6 transform transition-all duration-500 scale-100 opacity-100 motion-reduce:transform-none motion-reduce:transition-none">
        <div class="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-3 text-3xl font-extrabold text-gray-900 dark:text-white">
            <FaSolidRobot class="text-4xl text-indigo-500" />
            <span>AI Twitter Bot</span>
          </div>
        </div>

        <div class="text-center py-8">
          <FaSolidRobot class="text-6xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h2 class="text-2xl font-semibold text-gray-800 dark:text-white mb-2">How can I help you today?</h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm">
            Type your tweet below and click "Post" to share it instantly.
          </p>
        </div>

        <div class="h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-3 text-sm font-mono text-gray-800 dark:text-gray-200 shadow-inner">
          <Show when={isTyping()}>
            <div class="flex items-start space-x-2 animate-pulse">
              <FaSolidRobot class="text-indigo-400 mt-1 flex-shrink-0" />
              <span>🧠 AI: Typing...</span>
            </div>
          </Show>

          <For each={history()}>
            {(line) => (
              <div class="flex items-start space-x-2 animate-fade-in">
                {line.startsWith("👤 You:") ? (
                  <FaSolidUser class="text-blue-400 mt-1 flex-shrink-0" />
                ) : (
                  <FaSolidRobot class="text-indigo-400 mt-1 flex-shrink-0" />
                )}
                <span class="flex-grow">{line}</span>
              </div>
            )}
          </For>
        </div>

        {showTweetFeedback() && lastTweetId() && (
          <div class="bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 p-3 rounded-lg flex items-center justify-between text-sm shadow-sm animate-fade-in">
            <div class="flex items-center gap-2">
              <FiCheckCircle class="text-green-600 dark:text-green-300 text-lg" />
              <span>Tweet posted!</span>
            </div>
            <span class="font-medium">Tweet ID: {lastTweetId()}</span>
          </div>
        )}

        <div class="space-y-4">
          <input
            type="text"
            value={command()}
            onInput={(e) => setCommand(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                generateTweet(command());
                setCommand("");
              }
            }}
            placeholder="Type your topic or tweet..."
            maxlength={MAX_CHAR_LIMIT}
            class="w-full px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all duration-200 shadow-sm"
          />

          <div class="flex justify-between text-sm items-center">
            <span class="text-gray-500 dark:text-gray-400 font-medium">
              {command().length}/{MAX_CHAR_LIMIT}
            </span>

            <div class="flex gap-3">
              <button
                onClick={() => handleDirectPost(command())}
                disabled={isPosting() || !command().trim()}
                class="bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-600 transition-all"
              >
                {isPosting() ? (
                  <>
                    <FaSolidEllipsis class="animate-pulse mr-1" />
                    Posting...
                  </>
                ) : (
                  "Post"
                )}
              </button>

              <button
                onClick={() => generateTweet(command())}
                disabled={isGenerating()}
                class="bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600 transition-all"
              >
                {isGenerating() ? "Generating..." : "Generate via AI"}
              </button>

              <button
                onClick={speak}
                class="bg-purple-600 text-white px-4 py-2 rounded-full hover:bg-purple-700 transition-all"
              >
                🎤 Speak
              </button>
            </div>
          </div>
        </div>
{/* Image Prompt Input and Generate Button */}

        {/* Enhanced Generated Tweets Section */}
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden mt-8">
          <div class="border-b border-gray-200 dark:border-gray-700 p-4">
            <h2 class="text-xl font-bold flex items-center">
              <FaSolidPen class="mr-2 text-blue-500" />
              Generated Tweets
            </h2>
          </div>

          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold mb-3 flex items-center text-blue-500">
              <FaSolidEllipsis class="mr-2" />
              Drafts ({generatedTweets().filter(t => !t.posted).length})
            </h3>
            
            <For each={generatedTweets().filter(t => !t.posted)}>
              {(tweet) => (
                <div class="mb-4 last:mb-0 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                  <textarea
                    value={tweet.text}
                    onInput={(e) => {
                      const newText = e.currentTarget.value;
                      setGeneratedTweets(prev => 
                        prev.map(t => t.id === tweet.id ? {...t, text: newText} : t)
                      );
                    }}
                    class="w-full bg-transparent resize-none outline-none min-h-[80px]"
                    rows={3}
                  />
                  
                  <div class="flex justify-between items-center mt-2">
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      <span>{tweet.text.length}/{MAX_CHAR_LIMIT}</span>
                      <span class="block">Created: {new Date(tweet.id).toLocaleString()}</span>
                    </div>
                    <div class="flex space-x-2">
                      <button
                        onClick={() => postGeneratedTweet(tweet.id)}
                        disabled={isPosting() || tweet.text.length > MAX_CHAR_LIMIT}
                        class={`px-3 py-1 rounded-full text-sm ${
                          isPosting() || tweet.text.length > MAX_CHAR_LIMIT 
                            ? 'bg-gray-300 text-gray-500' 
                            : 'bg-green-500 hover:bg-green-600 text-white'
                        }`}
                      >
                        Post
                      </button>
                      <button
                        onClick={() => deleteGeneratedTweet(tweet.id)}
                        class="px-3 py-1 rounded-full text-sm bg-red-500 hover:bg-red-600 text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>

          <div class="p-4">
            <h3 class="text-lg font-semibold mb-3 flex items-center text-green-500">
              <FiCheckCircle class="mr-2" />
              Posted ({generatedTweets().filter(t => t.posted).length})
            </h3>

            <For each={generatedTweets().filter(t => t.posted)}>
              {(tweet) => (
                <div class="mb-4 last:mb-0 p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                  <p class="whitespace-pre-line">{tweet.text}</p>
                  <div class="flex justify-between items-center mt-2 text-xs text-green-600 dark:text-green-400">
                    <span>Posted: {new Date(tweet.id).toLocaleString()}</span>
                    <button
                      onClick={() => deleteGeneratedTweet(tweet.id)}
                      class="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                    >
                      <FaSolidTrash size={12} />
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {loggedInUser() && (
        <div class="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-6 mt-8 transform transition-all duration-500 scale-100 opacity-100 motion-reduce:transform-none motion-reduce:transition-none">
          <div class="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">Twitter Clone Feed</h2>
          </div>

          <div class="relative">
            <input
              type="text"
              value={searchTerm()}
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
              placeholder="Search tweets..."
              class="w-full px-4 py-2 pl-10 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all duration-200 shadow-sm"
            />
            <FiSearch class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          </div>

          <div class="space-y-4 max-h-96 overflow-y-auto">
            <For each={tweets().filter(tweet => 
              (tweet.content || tweet.text || "").toLowerCase().includes(searchTerm().toLowerCase())
            )}>
              {(tweet) => (
                <div class="border border-blue-300 dark:border-blue-700 rounded-lg p-4 shadow-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                  <div class="flex items-center space-x-3 mb-2">
                    <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                      {tweet.username?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <p class="font-bold text-gray-900 dark:text-white">
                        {tweet.username} <span class="text-gray-500 dark:text-gray-400 font-normal">@{tweet.username?.toLowerCase() || 'user'}</span>
                      </p>
                      <p class="text-gray-500 dark:text-gray-400 text-xs">
                        • {new Date(tweet.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <p class="text-gray-800 dark:text-gray-200 mb-3 text-lg">
                    {tweet.content || tweet.text}
                  </p>
                  <div class="flex justify-around text-gray-500 dark:text-gray-400 text-sm border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
                    <div class="flex items-center gap-1">
                      <FaSolidComment /> {tweet.comments || 0}
                    </div>
                    <div class="flex items-center gap-1">
                      <FaSolidRetweet /> {tweet.retweets || 0}
                    </div>
                    <div class="flex items-center gap-1">
                      <FaSolidHeart /> {tweet.likes || 0}
                    </div>
                    <div class="flex items-center gap-1">
                      <FaSolidShare />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      )}

      {generatedTweet() && (
        <div class="mt-4 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-md space-y-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white">Generated Tweet:</h3>
          <p class="text-gray-700 dark:text-gray-300 text-base">{generatedTweet()}</p>

          <div class="flex gap-3">
            <button
              class="bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-600"
              onClick={() => handleDirectPost(generatedTweet())}
            >
              Post
            </button>

            <button
              class="bg-yellow-500 text-white px-4 py-2 rounded-full hover:bg-yellow-600"
              onClick={() => {
                setCommand(generatedTweet() || "");
                setGeneratedTweet(null);
              }}
            >
              Edit
            </button>

            <button
              class="bg-red-500 text-white px-4 py-2 rounded-full hover:bg-red-600"
              onClick={() => setGeneratedTweet(null)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {showAuthModal() && (
        <div class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-sm space-y-4">
            <h2 class="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-white">
              {isLoginMode() ? "Login" : "Sign Up"}
            </h2>
            <form onSubmit={handleAuthSubmit} class="space-y-4">
              <div>
                <label for="auth-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  id="auth-username"
                  value={authUsername()}
                  onInput={(e) => setAuthUsername(e.currentTarget.value)}
                  class="w-full px-4 py-2 rounded-md border bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label for="auth-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  id="auth-password"
                  value={authPassword()}
                  onInput={(e) => setAuthPassword(e.currentTarget.value)}
                  class="w-full px-4 py-2 rounded-md border bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <button
                type="submit"
                class="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-800 shadow-md"
              >
                {isLoginMode() ? "Login" : "Sign Up"}
              </button>
            </form>
            <div class="mt-6 text-center text-sm">
              {isLoginMode() ? (
                <button 
                  onClick={() => setIsLoginMode(false)} 
                  class="text-blue-600 hover:underline font-medium"
                >
                  Create new account
                </button>
              ) : (
                <button 
                  onClick={() => setIsLoginMode(true)} 
                  class="text-blue-600 hover:underline font-medium"
                >
                  Already have an account? Login
                </button>
              )}
            </div>
            <button
              onClick={() => setShowAuthModal(false)}
              class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {messageBox() && (
        <div class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[100]">
          <div class={`rounded-xl shadow-2xl p-8 w-full max-w-sm text-center
            ${messageBox()?.type === "error" ? "bg-red-600 text-white" : "bg-white text-gray-800 dark:bg-gray-700 dark:text-white"}`}
          >
            <p class="mb-5 text-xl font-bold">{messageBox()?.message}</p>
            <button
              onClick={closeMessageBox}
              class={`py-2 px-6 rounded-md font-semibold text-lg
                ${messageBox()?.type === "error" ? "bg-red-800 hover:bg-red-900 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <ErrorDisplay />
    </div>
  );
};
