// import rateLimit from "express-rate-limit";

// const WINDOW_MS = 15 * 60 * 1000;

// export const generalApiRateLimiter = rateLimit({
//   windowMs: WINDOW_MS,
//   limit: 1000,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { message: "Too many requests. Please try again later." },
// });

// export const authRateLimiter = rateLimit({
//   windowMs: WINDOW_MS,
//   limit: 40,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { message: "Too many authentication attempts. Please try again later." },
// });

// export const webhookRateLimiter = rateLimit({
//   windowMs: WINDOW_MS,
//   limit: 200,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { message: "Too many webhook requests." },
// });
