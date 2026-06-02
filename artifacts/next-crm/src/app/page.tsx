"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        if (user.role === "admin") {
          router.push("/dashboard");
        } else {
          router.push("/compose");
        }
      } else {
        router.push("/login");
      }
    }
  }, [user, isLoading, router]);

  return null;
}
