const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");

/**
 * requireAuth: Ensures the user is logged in.
 * Uses ClerkExpressRequireAuth which will 401 if no valid session is found.
 */
const requireAuth = ClerkExpressRequireAuth();

/**
 * requireAdmin: Ensures the user is logged in AND has the 'admin' role.
 * This checks Clerk's publicMetadata for { "role": "admin" }.
 */
const requireAdmin = (req, res, next) => {
  // ClerkExpressRequireAuth populates req.auth
  if (!req.auth || !req.auth.userId) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  // Check public metadata for admin role
  // Note: For this to work, you must set the metadata in the Clerk Dashboard or via API
  const role = req.auth.sessionClaims?.public_metadata?.role;
  
  if (role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  next();
};

module.exports = {
  requireAuth,
  requireAdmin,
};
