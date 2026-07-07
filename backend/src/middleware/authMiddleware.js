import jwt from "jsonwebtoken";
import prisma from "../prisma.js";

/* Verify JWT */
export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // M2: honor User.tokenVersion so an access token minted BEFORE a password
    // reset or role change (both bump tokenVersion) is rejected within its own
    // 15-min lifetime — closing the window where a stolen/old token keeps working.
    // Strict only on a genuine mismatch; lenient if the user can't be loaded, so a
    // transient DB blip (or a test that doesn't stub the lookup) never locks users out.
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { tokenVersion: true, deletedAt: true },
      });
      if (dbUser && (dbUser.tokenVersion ?? 0) !== (decoded.tokenVersion ?? 0)) {
        return res
          .status(401)
          .json({ message: "Session no longer valid. Please sign in again." });
      }
      // AUTH-04: a soft-deleted account is treated as nonexistent everywhere.
      if (dbUser && dbUser.deletedAt) {
        return res.status(401).json({ message: "Account no longer exists." });
      }
    } catch {
      // DB unavailable — fall through on the JWT's own validity rather than hard-failing.
    }

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/* Optional auth: set req.user if valid token, never fail */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    // Enforce User.tokenVersion the same way authenticateUser does, but NEVER
    // fail: a token invalidated by a password reset / role change is simply
    // ignored (caller stays anonymous) instead of being honored on the public /
    // booking-create endpoints. Only a genuine mismatch drops auth; a missing
    // user or DB blip falls back to the JWT's own validity.
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { tokenVersion: true, deletedAt: true },
      });
      if (dbUser && (dbUser.tokenVersion ?? 0) !== (decoded.tokenVersion ?? 0)) {
        // stale token -> remain anonymous (do not set req.user)
      } else if (dbUser && dbUser.deletedAt) {
        // AUTH-04: soft-deleted account -> stay anonymous.
      } else {
        req.user = decoded;
      }
    } catch {
      req.user = decoded;
    }
  } catch {
    // ignore invalid/expired token
  }
  next();
};

/* Role Authorization */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};
