"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeSection, setActiveSection] = useState<"profile" | "security" | "preferences">("profile");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) router.push("/login");
        else return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setName(data.user.name);
          setEmail(data.user.email);
        }
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function updateProfile() {
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setSuccessMessage("Profile updated successfully");
        setUser((prev) => (prev ? { ...prev, name } : prev));
      } else {
        const data = await res.json();
        setErrorMessage(data.error || "Failed to update profile");
      }
    } catch {
      setErrorMessage("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setSuccessMessage("Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        setErrorMessage(data.error || "Failed to change password");
      }
    } catch {
      setErrorMessage("Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="text-sm text-zinc-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold">
              Kw
            </div>
            <span className="font-semibold">Kwen Gateway</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link href="/docs" className="text-sm text-zinc-400 hover:text-white transition">
              Docs
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 text-zinc-400">
            Manage your account settings and preferences.
          </p>
        </div>

        {/* Messages */}
        {successMessage && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* Section Tabs */}
        <div className="mb-8 flex gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1">
          {(["profile", "security", "preferences"] as const).map((section) => (
            <button
              key={section}
              onClick={() => {
                setActiveSection(section);
                setSuccessMessage("");
                setErrorMessage("");
              }}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition capitalize ${
                activeSection === section
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {section}
            </button>
          ))}
        </div>

        {/* Profile Section */}
        {activeSection === "profile" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-300">Profile Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-zinc-500"
                  />
                  <p className="mt-1 text-xs text-zinc-600">Email cannot be changed.</p>
                </div>
                <button
                  onClick={updateProfile}
                  disabled={saving || name === user?.name}
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-300">Account Details</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-white/5 px-4 py-3">
                  <span className="text-sm text-zinc-400">Member since</span>
                  <span className="text-sm">{user ? formatDate(user.createdAt) : "-"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/5 px-4 py-3">
                  <span className="text-sm text-zinc-400">Account ID</span>
                  <span className="font-mono text-xs text-zinc-500">{user?.id}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security Section */}
        {activeSection === "security" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-300">Change Password</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
                <button
                  onClick={changePassword}
                  disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving ? "Changing..." : "Change Password"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-300">API Access</h3>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">API Endpoint</div>
                    <div className="mt-1 font-mono text-xs text-zinc-500">https://your-gateway.com/v1</div>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preferences Section */}
        {activeSection === "preferences" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-300">Default Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Default Model</label>
                  <select className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500">
                    <option value="coder-fast">Coder Fast</option>
                    <option value="coder-smart">Coder Smart</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="architect">Architect</option>
                    <option value="deep-research">Deep Research</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Default Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    defaultValue="0.7"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Max Tokens</label>
                  <input
                    type="number"
                    min="1"
                    max="128000"
                    defaultValue="4096"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h3 className="mb-4 text-sm font-semibold text-zinc-300">Notifications</h3>
              <div className="space-y-3">
                {[
                  { label: "Email notifications for failed requests", defaultChecked: true },
                  { label: "Weekly usage summary", defaultChecked: false },
                  { label: "Rate limit warnings", defaultChecked: true },
                ].map((item) => (
                  <label
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-white/5 px-4 py-3 cursor-pointer"
                  >
                    <span className="text-sm">{item.label}</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        defaultChecked={item.defaultChecked}
                        className="peer sr-only"
                      />
                      <div className="h-5 w-9 rounded-full bg-white/10 transition peer-checked:bg-indigo-600" />
                      <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
              <h3 className="mb-2 text-sm font-semibold text-red-400">Danger Zone</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Permanently delete your account and all associated data.
              </p>
              <button className="rounded-xl border border-red-500/30 px-4 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10">
                Delete Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
