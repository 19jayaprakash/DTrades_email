import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-prod";

export interface AuthPayload {
  userId: number;
  role: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

/**
 * Serverless authentication middleware helper.
 * Reads the Authorization header, verifies the JWT, and returns the user object.
 * Returns null if unauthorized or invalid.
 */
export async function requireAuth(req: Request): Promise<typeof usersTable.$inferSelect | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * Verifies that the authenticated user is an administrator.
 */
export function requireAdmin(user: typeof usersTable.$inferSelect | null): boolean {
  return user !== null && user.role === "admin";
}
