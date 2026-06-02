import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

export function setupApi() {
  setAuthTokenGetter(() => {
    return localStorage.getItem("auth_token");
  });

  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    setBaseUrl(apiUrl);
  }
}
