import { useSignIn, useUser } from "@clerk/clerk-react";
import {
  AlertCircle,
  ArrowRight,
  Building,
  Factory,
  KeyRound,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wheat,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SunMark } from "../components/RiskSun";
import { DEFAULT_USERS, useApp } from "../state/AppState";

export default function Login() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { user } = useUser();
  const { loginAsDemo, pushToast, activeUser } = useApp();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"demo" | "clerk">("demo");

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      // Sync Clerk user with role
      const userEmail = user.primaryEmailAddress?.emailAddress;
      const matched = DEFAULT_USERS.find((u) => u.email === userEmail);
      if (matched) {
        loginAsDemo(matched);
      }
      navigate(matched?.role === "ADMIN" || matched?.role === "AUDITOR" ? "/admin" : "/portal");
    }
  }, [user, navigate, loginAsDemo]);

  // Handle custom Clerk sign-in form
  const handleClerkSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: email,
        password: password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        pushToast({
          tone: "ok",
          title: "Signed In Successfully",
          body: `Welcome back, ${email}`,
        });

        // Check if demo user matched
        const matched = DEFAULT_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (matched) {
          loginAsDemo(matched);
          navigate(matched.role === "ADMIN" || matched.role === "AUDITOR" ? "/admin" : "/portal");
        } else {
          navigate("/portal");
        }
      } else {
        setError("Sign-in requires further verification. Please check your email.");
      }
    } catch (err: any) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "Failed to sign in. Please verify your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle instant demo persona login
  const handleDemoLogin = (demoUser: typeof DEFAULT_USERS[0]) => {
    loginAsDemo(demoUser);
    pushToast({
      tone: "ok",
      title: `Logged in as ${demoUser.name}`,
      body: `Active role: ${demoUser.role} · Directing to ${demoUser.role === "ADMIN" || demoUser.role === "AUDITOR" ? "Admin Control Tower" : "Participant Workspace"}`,
    });

    const target = demoUser.role === "ADMIN" || demoUser.role === "AUDITOR" ? "/admin" : "/portal";
    navigate(target);
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-3xl bg-panel border border-line shadow-xl mb-1">
            <SunMark size={48} />
          </div>
          <div className="leading-tight">
            <span className="block text-2xl font-extrabold tracking-tight text-ink">AgriChain</span>
            <span className="block text-xs font-bold tracking-[0.3em] text-gold uppercase">SENTINEL ACCESS</span>
          </div>
          <p className="text-xs text-muted max-w-md mx-auto">
            Intelligent Agricultural Fraud Detection & Blockchain Ledger Platform. Sign in using Clerk or select a pre-configured demo identity.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-2xl border border-line bg-panel p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("demo")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "demo" ? "bg-gold text-gold-ink shadow-md" : "text-muted hover:text-ink"
            }`}
          >
            <Zap size={14} />
            <span>Instant Demo Personas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("clerk")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "clerk" ? "bg-gold text-gold-ink shadow-md" : "text-muted hover:text-ink"
            }`}
          >
            <Lock size={14} />
            <span>Custom Clerk Sign-In</span>
          </button>
        </div>

        {/* TAB 1: Instant Demo Persona Grid */}
        {activeTab === "demo" && (
          <div className="rounded-3xl border border-line bg-panel p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Zap size={16} className="text-gold" /> Choose a Pre-Verified Demo Identity
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Each persona comes pre-configured with distinct role permissions and an Ed25519 signing key.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEFAULT_USERS.map((u) => {
                const isCurrent = u.id === activeUser?.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleDemoLogin(u)}
                    className={`rounded-2xl border p-3.5 text-left transition relative flex items-center justify-between gap-3 ${
                      isCurrent
                        ? "border-gold bg-gold/10 shadow-md ring-1 ring-gold"
                        : "border-line bg-panel-2 hover:border-gold/60 hover:bg-panel-3"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                          isCurrent ? "bg-gold text-gold-ink" : "bg-panel border border-line text-gold"
                        }`}
                      >
                        {u.role === "FARMER" && <Wheat size={16} />}
                        {u.role === "COOP" && <Users size={16} />}
                        {u.role === "PROCESSOR" && <Factory size={16} />}
                        {u.role === "DISTRIBUTOR" && <Truck size={16} />}
                        {u.role === "RETAILER" && <Store size={16} />}
                        {u.role === "AUDITOR" && <Shield size={16} />}
                        {u.role === "ADMIN" && <Building size={16} />}
                      </div>

                      <div className="min-w-0 leading-tight">
                        <span className="block text-xs font-bold text-ink truncate">{u.name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="rounded bg-panel px-1.5 py-0.2 text-[9px] font-mono font-bold text-gold">
                            {u.role}
                          </span>
                          <span className="text-[10px] text-muted truncate">{u.email}</span>
                        </div>
                      </div>
                    </div>

                    <ArrowRight size={14} className="text-muted shrink-0" />
                  </button>
                );
              })}
            </div>

            <div className="pt-2 text-center text-xs text-muted">
              <span>Looking to test with a real Clerk account? </span>
              <button
                type="button"
                onClick={() => setActiveTab("clerk")}
                className="text-gold font-bold hover:underline"
              >
                Switch to Clerk Login →
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Custom Clerk Authentication Form */}
        {activeTab === "clerk" && (
          <div className="rounded-3xl border border-line bg-panel p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Lock size={16} className="text-gold" /> Sign In with Clerk
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Enter your registered Clerk credentials to access your organization workspace.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-quar/50 bg-quar/10 p-3 text-xs text-quar flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleClerkSignIn} className="space-y-4 text-xs">
              <div>
                <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                  <Mail size={13} className="text-gold" /> Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. ramesh@kisanfarm.in or admin@agrichain.sentinel"
                  className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                  <KeyRound size={13} className="text-gold" /> Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !isLoaded}
                className="btn-gold w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? "Authenticating via Clerk..." : "Sign In to AgriChain"}
                <ArrowRight size={14} />
              </button>
            </form>

            <div className="pt-2 border-t border-line/60 flex items-center justify-between text-xs text-muted">
              <span>Don't have a Clerk account?</span>
              <Link to="/signup" className="text-gold font-bold hover:underline">
                Register New Organization →
              </Link>
            </div>
          </div>
        )}

        {/* Security Footer Notice */}
        <div className="text-center text-[11px] text-muted flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Non-Custodial Cryptographic Security & Role-Based Access Enforcement</span>
        </div>
      </div>
    </div>
  );
}
