import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center gradient-bg">
      <div className="flex flex-col items-center text-center px-6 animate-fade-in-up">
        <AlertCircle className="h-16 w-16 text-primary/30 mb-6" />
        <h1 className="text-8xl font-bold gradient-text mb-4">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-2">Page Not Found</h2>
        <p className="text-muted-foreground text-sm max-w-md mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link 
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:from-indigo-600 hover:to-violet-600 transition-all duration-200"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
