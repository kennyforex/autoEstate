import React, { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Lock, Zap } from "lucide-react";
import { Button, Input } from "../components/common";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../lib/api";

export const SetPassword: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    updateUser,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!authLoading && !token) {
      navigate("/login");
    }
  }, [authLoading, token, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // If user is already active (has set password before), go to dashboard
  if (user?.status === "active") {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      const { user: updatedUser } = await authApi.setPassword(newPassword);
      updateUser(updatedUser);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-text-primary">AutoEstate</span>
          </div>

          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            Welcome! Set your password
          </h1>
          <p className="text-text-secondary mb-8">
            You’ve been invited to the team. Choose a password to activate your
            account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-error">
                {error}
              </div>
            )}

            <Input
              type="password"
              label="New password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              type="password"
              label="Confirm password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
              rightIcon={<Lock className="w-4 h-4" />}
            >
              Set password & continue
            </Button>
          </form>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-dark p-8">
        <div className="max-w-md text-center">
          <span className="inline-block px-4 py-1.5 bg-primary/20 text-primary text-sm font-medium tracking-wide uppercase rounded-full mb-6">
            You’re almost in
          </span>
          <h2 className="text-3xl font-semibold text-white mb-4">
            One more step to get started
          </h2>
          <p className="text-gray-400">
            Set a secure password to access your account and start collaborating
            with your team.
          </p>
        </div>
      </div>
    </div>
  );
};
