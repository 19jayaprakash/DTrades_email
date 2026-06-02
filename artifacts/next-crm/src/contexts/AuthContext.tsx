import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { useGetMe, getGetMeQueryKey, useLogin, useLogout, User, LoginInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (data: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setToken(localStorage.getItem("auth_token"));
    }
  }, []);

  const { data: user = null, isLoading: isLoadingUser, isError } = useGetMe({
    query: { 
      queryKey: getGetMeQueryKey(),
      enabled: !!token,
      retry: false
    }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  useEffect(() => {
    if (isError) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
      }
      setToken(null);
      queryClient.setQueryData(getGetMeQueryKey(), null);
    }
  }, [isError, queryClient]);

  const login = useCallback(async (data: LoginInput) => {
    const res = await loginMutation.mutateAsync({ data });
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", res.token);
    }
    setToken(res.token);
    queryClient.setQueryData(getGetMeQueryKey(), res.user);
    router.push("/dashboard");
  }, [loginMutation, queryClient, router]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (e) {
      // Ignore errors on logout
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
      }
      setToken(null);
      queryClient.setQueryData(getGetMeQueryKey(), null);
      router.push("/login");
    }
  }, [logoutMutation, queryClient, router]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading: isLoadingUser && !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

