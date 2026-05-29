(function attachAuth(global) {
  var CONFIG = {
    AUTH_MODE: "local",
    AUTH_API_BASE_URL: "https://your-aliyun-domain.example.com",
    LOGIN_ENDPOINT: "/api/auth/login",
    PROFILE_ENDPOINT: "/api/auth/profile",
    LOGOUT_ENDPOINT: "/api/auth/logout",
    VALIDATE_ENDPOINT: "/api/auth/validate",
    LOGIN_PAGE: "/login.html",
    HOME_PAGE: "/index.html",
    STORAGE_KEY: "haizong.auth.session.v1",
    SESSION_TTL_MS: 8 * 60 * 60 * 1000,
    LOCAL_CREDENTIALS: {
      username: "admin",
      password: "123456",
      displayName: "海总管理员",
    },
  };

  function getStorage() {
    try {
      return global.localStorage;
    } catch {
      return null;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function joinUrl(base, path) {
    var normalizedBase = String(base || "").replace(/\/+$/, "");
    var normalizedPath = String(path || "").startsWith("/") ? path : "/" + String(path || "");
    return normalizedBase + normalizedPath;
  }

  function createToken(prefix) {
    return [prefix, Date.now().toString(36), Math.random().toString(36).slice(2, 10)].join("_");
  }

  function isSessionExpired(session) {
    if (!session || !session.expiresAt) {
      return true;
    }

    var expiresAt = new Date(session.expiresAt).getTime();
    return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
  }

  function clearSession() {
    var storage = getStorage();
    if (storage) {
      storage.removeItem(CONFIG.STORAGE_KEY);
    }
  }

  function persistSession(session) {
    var storage = getStorage();
    if (!storage) {
      return session;
    }

    storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    var storage = getStorage();
    if (!storage) {
      return null;
    }

    var raw = storage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      var session = JSON.parse(raw);
      if (!session || typeof session !== "object" || isSessionExpired(session)) {
        clearSession();
        return null;
      }
      return session;
    } catch {
      clearSession();
      return null;
    }
  }

  function isAuthenticated() {
    return !!getSession();
  }

  function redirectTo(url) {
    if (global.location.pathname !== url) {
      global.location.replace(url);
    }
  }

  function redirectToLogin() {
    redirectTo(CONFIG.LOGIN_PAGE);
  }

  function redirectToHome() {
    redirectTo(CONFIG.HOME_PAGE);
  }

  function toSession(payload) {
    var loginAt = payload.loginAt || nowIso();
    return {
      token: String(payload.token || createToken(payload.authMode || "token")),
      username: String(payload.username || ""),
      displayName: String(payload.displayName || payload.username || ""),
      loginAt: loginAt,
      expiresAt: String(payload.expiresAt || new Date(Date.now() + CONFIG.SESSION_TTL_MS).toISOString()),
      authMode: payload.authMode === "remote" ? "remote" : "local",
    };
  }

  function normalizeCredentials(credentials) {
    return {
      username: String(credentials && credentials.username || "").trim(),
      password: String(credentials && credentials.password || ""),
    };
  }

  async function loginWithLocal(credentials) {
    var normalized = normalizeCredentials(credentials);

    if (!normalized.username || !normalized.password) {
      var missingError = new Error("请输入账号和密码。");
      missingError.code = "MISSING_CREDENTIALS";
      throw missingError;
    }

    if (
      normalized.username !== CONFIG.LOCAL_CREDENTIALS.username ||
      normalized.password !== CONFIG.LOCAL_CREDENTIALS.password
    ) {
      var invalidError = new Error("账号或密码错误。");
      invalidError.code = "INVALID_CREDENTIALS";
      throw invalidError;
    }

    return toSession({
      token: createToken("local"),
      username: normalized.username,
      displayName: CONFIG.LOCAL_CREDENTIALS.displayName,
      authMode: "local",
    });
  }

  async function requestRemote(path, options) {
    var response = await fetch(joinUrl(CONFIG.AUTH_API_BASE_URL, path), {
      method: options && options.method || "GET",
      headers: Object.assign({ "Content-Type": "application/json" }, options && options.headers),
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });

    var payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      var message = payload.message || "远程登录失败，请检查服务端配置。";
      var requestError = new Error(message);
      requestError.code = payload.code || "REMOTE_AUTH_FAILED";
      throw requestError;
    }

    return payload;
  }

  async function loginWithRemote(credentials) {
    var normalized = normalizeCredentials(credentials);
    var payload = await requestRemote(CONFIG.LOGIN_ENDPOINT, {
      method: "POST",
      body: {
        username: normalized.username,
        password: normalized.password,
      },
    });

    return toSession({
      token: payload.token,
      username: payload.user && payload.user.username || normalized.username,
      displayName: payload.user && payload.user.displayName || normalized.username,
      expiresAt: payload.expiresAt,
      authMode: "remote",
    });
  }

  async function fetchCurrentUser(token) {
    if (CONFIG.AUTH_MODE !== "remote") {
      var session = getSession();
      return session ? { username: session.username, displayName: session.displayName } : null;
    }

    return requestRemote(CONFIG.PROFILE_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
      },
    });
  }

  async function validateSession(token) {
    if (CONFIG.AUTH_MODE !== "remote") {
      return { valid: true };
    }

    return requestRemote(CONFIG.VALIDATE_ENDPOINT, {
      method: "POST",
      body: { token: token },
    });
  }

  async function login(credentials) {
    var session = CONFIG.AUTH_MODE === "remote"
      ? await loginWithRemote(credentials)
      : await loginWithLocal(credentials);

    persistSession(session);
    global.dispatchEvent(new CustomEvent("auth:login", { detail: session }));
    return session;
  }

  function logout(options) {
    var settings = Object.assign({ redirect: true, redirectTo: CONFIG.LOGIN_PAGE }, options);
    clearSession();
    global.dispatchEvent(new CustomEvent("auth:logout"));
    if (settings.redirect) {
      redirectTo(settings.redirectTo);
    }
  }

  function requireAuth() {
    var session = getSession();
    if (!session) {
      redirectToLogin();
      return null;
    }
    return session;
  }

  function redirectIfAuthenticated() {
    if (isAuthenticated()) {
      redirectToHome();
      return true;
    }
    return false;
  }

  global.AppAuth = {
    config: CONFIG,
    loginWithLocal: loginWithLocal,
    loginWithRemote: loginWithRemote,
    fetchCurrentUser: fetchCurrentUser,
    validateSession: validateSession,
    login: login,
    logout: logout,
    getSession: getSession,
    isAuthenticated: isAuthenticated,
    requireAuth: requireAuth,
    redirectIfAuthenticated: redirectIfAuthenticated,
    clearSession: clearSession,
  };
})(window);
