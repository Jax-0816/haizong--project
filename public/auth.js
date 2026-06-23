(function attachAuth(global) {
  var defaults = {
    AUTH_API_BASE_URL: "",
    LOGIN_ENDPOINT: "/api/auth/login",
    PROFILE_ENDPOINT: "/api/auth/profile",
    LOGOUT_ENDPOINT: "/api/auth/logout",
    VALIDATE_ENDPOINT: "/api/auth/validate",
    LOGIN_PAGE: "/login.html",
    HOME_PAGE: "/index.html",
    STORAGE_KEY: "haizong.auth.session.v1",
  };
  var runtimeConfig = global.__APP_CONFIG__ && typeof global.__APP_CONFIG__ === "object" ? global.__APP_CONFIG__ : {};
  var CONFIG = {
    AUTH_API_BASE_URL: runtimeConfig.AUTH_API_BASE_URL || defaults.AUTH_API_BASE_URL,
    LOGIN_ENDPOINT: runtimeConfig.LOGIN_ENDPOINT || defaults.LOGIN_ENDPOINT,
    PROFILE_ENDPOINT: runtimeConfig.PROFILE_ENDPOINT || defaults.PROFILE_ENDPOINT,
    LOGOUT_ENDPOINT: runtimeConfig.LOGOUT_ENDPOINT || defaults.LOGOUT_ENDPOINT,
    VALIDATE_ENDPOINT: runtimeConfig.VALIDATE_ENDPOINT || defaults.VALIDATE_ENDPOINT,
    LOGIN_PAGE: runtimeConfig.LOGIN_PAGE || defaults.LOGIN_PAGE,
    HOME_PAGE: runtimeConfig.HOME_PAGE || defaults.HOME_PAGE,
    STORAGE_KEY: runtimeConfig.STORAGE_KEY || defaults.STORAGE_KEY,
  };

  function getStorage() {
    try {
      return global.localStorage;
    } catch {
      return null;
    }
  }

  function joinUrl(base, path) {
    var normalizedBase = String(base || "").replace(/\/+$/, "");
    var normalizedPath = String(path || "").startsWith("/") ? path : "/" + String(path || "");
    return normalizedBase + normalizedPath;
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
      if (!session || typeof session !== "object" || isSessionExpired(session) || !session.token || !session.phone || !session.role) {
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

  async function requestAuth(path, options) {
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
      var message = payload.error || payload.message || "认证请求失败。";
      var requestError = new Error(message);
      requestError.code = payload.code || "AUTH_REQUEST_FAILED";
      throw requestError;
    }

    return payload;
  }

  function toSession(payload) {
    var user = payload.user || {};
    return {
      token: String(payload.token || ""),
      phone: String(user.phone || user.username || ""),
      username: String(user.username || user.phone || ""),
      displayName: String(user.displayName || user.phone || ""),
      role: user.role === "admin" ? "admin" : "member",
      status: String(user.status || "active"),
      loginAt: String(payload.loginAt || new Date().toISOString()),
      expiresAt: String(payload.expiresAt || ""),
      authMode: "server",
    };
  }

  function getAuthHeaders(token) {
    return token ? { Authorization: "Bearer " + token } : {};
  }

  async function login(credentials) {
    var payload = await requestAuth(CONFIG.LOGIN_ENDPOINT, {
      method: "POST",
      body: {
        identifier: credentials && credentials.identifier,
        password: credentials && credentials.password,
      },
    });
    var session = toSession(payload);
    persistSession(session);
    global.dispatchEvent(new CustomEvent("auth:login", { detail: session }));
    return session;
  }

  async function fetchCurrentUser(token) {
    return requestAuth(CONFIG.PROFILE_ENDPOINT, {
      method: "GET",
      headers: getAuthHeaders(token),
    });
  }

  async function validateSession(token) {
    return requestAuth(CONFIG.VALIDATE_ENDPOINT, {
      method: "POST",
      body: { token: token },
    });
  }

  async function logout(options) {
    var settings = Object.assign({ redirect: true, redirectTo: CONFIG.LOGIN_PAGE }, options);
    var session = getSession();
    clearSession();
    if (session && session.token) {
      requestAuth(CONFIG.LOGOUT_ENDPOINT, {
        method: "POST",
        headers: getAuthHeaders(session.token),
      }).catch(function ignoreLogoutError() {});
    }
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
    fetchCurrentUser: fetchCurrentUser,
    validateSession: validateSession,
    login: login,
    logout: logout,
    getSession: getSession,
    isAuthenticated: isAuthenticated,
    requireAuth: requireAuth,
    redirectIfAuthenticated: redirectIfAuthenticated,
    clearSession: clearSession,
    getAuthHeaders: getAuthHeaders,
  };
})(window);
