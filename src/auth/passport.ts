import passport from "passport";
import { Profile, Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "../db/client";
import { env, isGoogleAuthConfigured } from "../config/env";

interface SessionUser {
  id: string;
}

passport.serializeUser((user, done) => {
  done(null, (user as SessionUser).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user || false);
  } catch (error) {
    done(error as Error);
  }
});

if (isGoogleAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL
      },
      async (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
        try {
          const primaryEmail = profile.emails?.[0]?.value;
          if (!primaryEmail) {
            done(new Error("Google profile has no email"));
            return;
          }

          const user = await prisma.user.upsert({
            where: { googleSub: profile.id },
            update: {
              email: primaryEmail,
              displayName: profile.displayName || primaryEmail,
              avatarUrl: profile.photos?.[0]?.value
            },
            create: {
              googleSub: profile.id,
              email: primaryEmail,
              displayName: profile.displayName || primaryEmail,
              avatarUrl: profile.photos?.[0]?.value
            }
          });

          done(null, { id: user.id });
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
}

export { passport };
