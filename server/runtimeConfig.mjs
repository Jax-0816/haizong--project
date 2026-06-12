import { getEnv } from "./config.mjs";

export function getAppRuntimeConfig() {
  return {
    AUTH_API_BASE_URL: getEnv("AUTH_API_BASE_URL", ""),
    CODE_ENDPOINT: getEnv("AUTH_CODE_ENDPOINT", "/api/auth/code/send"),
    LOGIN_ENDPOINT: getEnv("AUTH_LOGIN_ENDPOINT", "/api/auth/login"),
    PROFILE_ENDPOINT: getEnv("AUTH_PROFILE_ENDPOINT", "/api/auth/profile"),
    LOGOUT_ENDPOINT: getEnv("AUTH_LOGOUT_ENDPOINT", "/api/auth/logout"),
    VALIDATE_ENDPOINT: getEnv("AUTH_VALIDATE_ENDPOINT", "/api/auth/validate"),
    LOGIN_PAGE: getEnv("AUTH_LOGIN_PAGE", "/login.html"),
    HOME_PAGE: getEnv("AUTH_HOME_PAGE", "/index.html"),
    STORAGE_KEY: getEnv("AUTH_STORAGE_KEY", "haizong.auth.session.v1"),
    SESSION_TTL_MS: Number(getEnv("AUTH_SESSION_TTL_MS", String(8 * 60 * 60 * 1000))),
  };
}
