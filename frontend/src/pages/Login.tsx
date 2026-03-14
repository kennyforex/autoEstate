import React, { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, ArrowRight, Zap } from "lucide-react";
import { Button, Input } from "../components/common";
import { useAuth } from "../context/AuthContext";
import { companyApi } from "../lib/api";

function resolveLogoUrl(logo: string | undefined): string | undefined {
  if (!logo) return undefined;
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  const base = (
    import.meta.env.VITE_API_URL || "http://localhost:3001/api"
  ).replace(/\/api\/?$/, "");
  return `${base}${logo.startsWith("/") ? "" : "/"}${logo}`;
}

export const Login: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [branding, setBranding] = useState<{ logo?: string; name?: string }>(
    {},
  );
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => {
    companyApi
      .getPublic()
      .then(setBranding)
      .catch(() => {});
  }, []);
  useEffect(() => {
    setLogoLoadFailed(false);
  }, [branding.logo]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login({ email, password });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const logoUrl = resolveLogoUrl(branding.logo);
  const showLogo = logoUrl && !logoLoadFailed;

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-[400px]">
          {/* Logo from settings or fallback */}
          <div className="flex items-center gap-3 mb-8">
            {showLogo ? (
              <img
                src={logoUrl}
                alt={branding.name || "Logo"}
                className="h-12 w-auto max-w-[180px] object-contain object-left"
                onError={() => setLogoLoadFailed(true)}
              />
            ) : (
              <>
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <span className="text-2xl font-bold text-text-primary">
                  {branding.name || "AutoEstate"}
                </span>
              </>
            )}
          </div>

          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            {t("login.welcomeBack")}
          </h1>
          <p className="text-text-secondary mb-8">
            {t("login.signInPrompt")}
          </p>

          {/* Email login form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-error">
                {error}
              </div>
            )}

            <Input
              type="email"
              label={t("login.email")}
              placeholder={t("login.emailPlaceholder")}
              leftIcon={<Mail className="w-4 h-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              type="password"
              label={t("login.password")}
              placeholder={t("login.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              {t("login.continue")}
            </Button>
          </form>

          {/* Terms */}
          <p className="text-center text-caption text-text-secondary mt-6">
            {t("login.termsPrefix")}{" "}
            <a href="#" className="text-primary hover:underline">
              {t("login.termsLink")}
            </a>
          </p>
        </div>
      </div>

      {/* Right Panel - Branding */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-dark p-8">
        <div className="max-w-md text-center">
          <span className="inline-block px-4 py-1.5 bg-primary/20 text-primary text-sm font-medium tracking-wide uppercase rounded-full mb-6">
            {t("login.aiPoweredSupport")}
          </span>
          <h2 className="text-3xl font-semibold text-white mb-4">
            {t("login.heroTitle")}
          </h2>
          <p className="text-gray-400">
            {t("login.heroSubtitle")}
          </p>
        </div>
      </div>
    </div>
  );
};
