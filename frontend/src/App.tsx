import { createSignal, For, onMount } from "solid-js";
import {
  FaSolidUser,
  FaSolidRobot,
  FaSolidComment,
  FaSolidRetweet,
  FaSolidHeart,
  FaSolidShare
} from "solid-icons/fa";
import { FiCheckCircle, FiSearch } from 'solid-icons/fi';

export default function App() {
  const [theme, setTheme] = createSignal("light");
  const [command, setCommand] = createSignal("");
  const [history, setHistory] = createSignal<string[]>([]);
  const MAX_CHAR_LIMIT = 280;

  const [messageBox, setMessageBox] = createSignal<{ message: string, type: "info" | "error" } | null>(null);
  const showMessageBox = (message: string, type: "info" | "error") => {
    setMessageBox({ message, type });
  };
  const closeMessageBox = () => {
    setMessageBox(null);
  };

  const [showAuthModal, setShowAuthModal] = createSignal(false);
  const [isLoginMode, setIsLoginMode] = createSignal(true);
  const [authUsername, setAuthUsername] = createSignal("");
  const [authPassword, setAuthPassword] = createSignal("");
  const [authToken, setAuthToken] = createSignal<string | null>(null);
  const [loggedInUser, setLoggedInUser] = createSignal<string | null>(null);

  const [lastTweetId, setLastTweetId] = createSignal<string | null>(null);
  const [showTweetFeedback, setShowTweetFeedback] = createSignal(false);

  const [tweets, setTweets] = createSignal<any[]>([]);
  const [searchTerm, setSearchTerm] = createSignal("");

  const LOCAL_BACKEND_URL = "https://ai-twitter-bot-ayu.onrender.com";

  const handleAuthSubmit = (event: Event) => {
    event.preventDefault();

    if (!authUsername() || !authPassword()) {
      showMessageBox("Username and password are required.", "error");
      return;
    }

    if (isLoginMode()) {
      setLoggedInUser(authUsername());
      setAuthToken("dummy-auth-token-for-development");
      localStorage.setItem("authToken", "dummy-auth-token-for-development");
      localStorage.setItem("loggedInUser", authUsername());
      setShowAuthModal(false);
      setAuthUsername("");
      setAuthPassword("");
      showMessageBox("Login successful!", "info");
      fetchTweets();
    } else {
      setLoggedInUser(authUsername());
      setAuthToken("dummy-auth-token-for-development");
      localStorage.setItem("authToken", "dummy-auth-token-for-development");
      localStorage.setItem("loggedInUser", authUsername());
      setShowAuthModal(false);
      setAuthUsername("");
      setAuthPassword("");
      showMessageBox("Signup successful! You are now logged in.", "info");
      fetchTweets();
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setLoggedInUser(null);
    localStorage.removeItem("authToken");
    localStorage.removeItem("loggedInUser");
    showMessageBox("Logged out successfully!", "info");
    setTweets([]);
  };

  const handleCommand = async () => {
    const text = command().trim();
    if (!text) {
      showMessageBox("Command cannot be empty.", "info");
      return;
    }
    setHistory((prev) => [...prev, `🧠 You: ${text}`]);
    setCommand("");

    setShowTweetFeedback(false);
    setLastTweetId(null);

    const commonHeaders: HeadersInit = { "Content-Type": "application/json" };

    if (text.toLowerCase().startsWith("post ")) {
      const tweet = text.replace(/^post /i, "").trim();

      if (!tweet) {
        showMessageBox("Tweet content cannot be empty after 'post'.", "info");
        return;
      }
      if (tweet.length > MAX_CHAR_LIMIT) {
        showMessageBox(`Tweet is too long! Max ${MAX_CHAR_LIMIT} characters.`, "error");
        return;
      }

      try {
        // Directing the 'post' command to your LOCAL BACKEND PROXY
        const res = await fetch(`${LOCAL_BACKEND_URL}/proxy-post-tweet`, {
          method: "POST",
          headers: commonHeaders,
          body: JSON.stringify({ content: tweet }), // Your backend expects 'content'
        });

        const data = await res.json();
        if (res.ok) {
          setHistory((prev) => [...prev, `🤖 AI: ${data.message || "Tweet sent via proxy!"}`]);
          setLastTweetId(data.tweet_id || "PROXIED_POST");
          setShowTweetFeedback(true);
          fetchTweets(); // Refresh tweets after a successful post
        } else {
          // If your local backend returns an error (e.g., if it failed to reach external API)
          showMessageBox(`Post Error (Local Proxy): ${data.detail || "Failed to post tweet via local proxy."}`, "error");
        }
      } catch (error) {
        // If frontend cannot even reach your local backend
        showMessageBox(`Network Error: Failed to connect to local backend for posting. ${error.message}`, "error");
      }
    } else if (text.toLowerCase().startsWith("ask ai")) {
      const topic = text.replace(/^ask ai/i, "").trim() || "a general tweet idea";
      try {
        // This still correctly points to your local backend for AI generation
        const res = await fetch(`${LOCAL_BACKEND_URL}/generate-tweet`, {
          method: "GET",
          headers: commonHeaders,
        });
        const data = await res.json();
        if (res.ok) {
          setHistory(prev => [...prev, `🤖 AI Idea: ${data.idea || "No idea generated."}`]);
        } else {
          showMessageBox(`AI Gen Error: ${data.detail || "Failed to generate AI idea."}`, "error");
        }
      } catch (error) {
        showMessageBox(`Network Error: Failed to fetch AI idea from local backend. ${error.message}`, "error");
      }
    }
    else {
      setHistory((prev) => [...prev, `🤖 AI: Command not recognized. Try 'post Your tweet' or 'ask ai [topic]'.`]);
    }
  };

  const speak = () => {
    if (!('webkitSpeechRecognition' in window)) {
      showMessageBox("Speech recognition not supported in this browser.", "error");
      return;
    }
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      showMessageBox("Listening... speak your command.", "info");
    };

    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setCommand(transcript);
      closeMessageBox();
    };

    recognition.onerror = (e: any) => {
      closeMessageBox();
      showMessageBox(`Speech recognition error: ${e.error}`, "error");
    };

    recognition.onend = () => {
      console.log('Speech recognition ended.');
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
      const res = await fetch(`${LOCAL_BACKEND_URL}/tweets`, {
        method: "GET",
      });

      const data = await res.json();
      if (res.ok) {
        setTweets(data);
      } else {
        console.error("Failed to fetch tweets from local proxy:", data.detail || "Unknown error");
        showMessageBox(`Failed to load tweets from local proxy: ${data.detail || "Unknown error"}`, "error");
        setTweets([]);
      }
    } catch (error) {
      console.error("Network error fetching tweets from local backend:", error);
      showMessageBox(`Network error fetching tweets from local backend: ${error.message}`, "error");
      setTweets([]);
    }
  };

  onMount(() => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
    }

    const storedAuthToken = localStorage.getItem("authToken");
    const storedLoggedInUser = localStorage.getItem("loggedInUser");
    if (storedAuthToken && storedLoggedInUser) {
      setAuthToken(storedAuthToken);
      setLoggedInUser(storedLoggedInUser);
      fetchTweets();
    }
  });

  return (
    <div class="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-200 dark:from-gray-900 dark:to-black transition-all duration-500 p-4">
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
            <div class="absolute inset-0 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
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
            Ask me anything or try one of the suggestions below to get started.
          </p>
        </div>

        <div class="h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-3 text-sm font-mono text-gray-800 dark:text-gray-200 shadow-inner">
          <For each={history()}>
            {(line) => (
              <div class="flex items-start space-x-2 animate-fade-in">
                {line.startsWith("🧠 You:") ? (
                  <FaSolidUser class="text-blue-400 mt-1 flex-shrink-0" />
                ) : (
                  <FaSolidRobot class="text-indigo-400 mt-1 flex-shrink-0" />
                )}
                <span class="flex-grow">{line}</span>
              </div>
            )}
          </For>
          {loggedInUser() && (
            <div class="text-gray-600 dark:text-gray-300 text-right mt-2 text-xs">
              Logged in as: {loggedInUser()}
            </div>
          )}
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
            onKeyDown={(e) => e.key === "Enter" && handleCommand()}
            placeholder="Ask something..."
            maxlength={MAX_CHAR_LIMIT}
            class="w-full px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all duration-200 shadow-sm"
          />
          <div class="flex justify-between text-sm items-center">
            <span class="text-gray-500 dark:text-gray-400 font-medium">
              {command().length}/{MAX_CHAR_LIMIT}
            </span>
            <div class="flex gap-3">
              <button
                onClick={handleCommand}
                class="bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-800 shadow-md"
              >
                ✨ Generate Tweet
              </button>
              <button
                onClick={speak}
                class="bg-purple-600 text-white px-4 py-2 rounded-full hover:bg-purple-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-800 shadow-md"
              >
                <span class="flex items-center gap-1">🎤 Speak</span>
              </button>
            </div>
          </div>
          <button
            onClick={handleCommand}
            class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-800 shadow-lg"
          >
            🚀 Run Command
          </button>
        </div>
      </div>

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
                <p class="text-gray-700 dark:text-gray-300">
                  Don't have an account?{" "}
                  <button onClick={() => setIsLoginMode(false)} class="text-blue-600 hover:underline font-medium focus:outline-none">Sign Up</button>
                </p>
              ) : (
                <p class="text-gray-700 dark:text-gray-300">
                  Already have an account?{" "}
                  <button onClick={() => setIsLoginMode(true)} class="text-blue-600 hover:underline font-medium focus:outline-none">Login</button>
                </p>
              )
              }
            </div>
            <button
              onClick={() => { setShowAuthModal(false); setAuthUsername(""); setAuthPassword(""); }}
              class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl focus:outline-none"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {messageBox() && (
        <div class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[100]">
          <div class={`rounded-xl shadow-2xl p-8 w-full max-w-sm text-center transform transition-all duration-300 ease-out scale-100 opacity-100
            ${messageBox()?.type === "error" ? "bg-red-600 text-white" : "bg-white text-gray-800 dark:bg-gray-700 dark:text-white"}`}
          >
            <p class="mb-5 text-xl font-bold">{messageBox()?.message}</p>
            <button
              onClick={closeMessageBox}
              class={`py-2 px-6 rounded-md font-semibold text-lg transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2
                ${messageBox()?.type === "error" ? "bg-red-800 hover:bg-red-900 focus:ring-red-500 focus:ring-offset-red-200 text-white" : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 focus:ring-offset-white text-white"}`}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {loggedInUser() && ( // Only show if logged in
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
            <For each={tweets().filter(tweet => tweet.text.toLowerCase().includes(searchTerm().toLowerCase()))}>
              {(tweet) => (
                <div class="border border-blue-300 dark:border-blue-700 rounded-lg p-4 shadow-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                  <div class="flex items-center space-x-3 mb-2">
                    <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {tweet.username ? tweet.username.charAt(0).toUpperCase() : '?'}{/* First letter of username */}
                    </div>
                    <div>
                      <p class="font-bold text-gray-900 dark:text-white">
                        {tweet.username} <span class="text-gray-500 dark:text-gray-400 font-normal">@{tweet.username?.toLowerCase() || 'user'}</span>
                      </p>
                      <p class="text-gray-500 dark:text-gray-400 text-xs">
                         • {new Intl.DateTimeFormat('en-US', {
                          hour: 'numeric',
                          minute: 'numeric',
                          hour12: true, // Use 12-hour format with AM/PM
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }).format(new Date(tweet.timestamp))}
                      </p>
                    </div>
                  </div>
                  <p class="text-gray-800 dark:text-gray-200 mb-3 text-lg leading-relaxed">
                    {tweet.text.split(' ').map((word) =>
                      word.startsWith('#') ? (
                        <span class="text-blue-600 dark:text-blue-400 font-semibold">{word} </span>
                      ) : (
                        `${word} `
                      )
                    )}
                  </p>
                  <div class="flex justify-around text-gray-500 dark:text-gray-400 text-sm border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
                    <div class="flex items-center gap-1">
                      <FaSolidComment /> {tweet.comments || 0}
                    </div>
                    <div class="flex items-center gap-1">
                      <FaSolidRetweet /> {tweet.retweets}
                    </div>
                    <div class="flex items-center gap-1">
                      <FaSolidHeart /> {tweet.likes}
                    </div>
                    <div class="flex items-center gap-1">
                      <FaSolidShare />
                    </div>
                  </div>
                </div>
              )}
            </For>
            {tweets().filter(tweet => tweet.text.toLowerCase().includes(searchTerm().toLowerCase())).length === 0 && (
              <p class="text-center text-gray-500 dark:text-gray-400 py-10">No matching tweets to display. Try posting one using the AI Bot!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
