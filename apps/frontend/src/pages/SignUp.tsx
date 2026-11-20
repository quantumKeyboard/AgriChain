import { useSignUp } from "@clerk/clerk-react";
import {
  AlertCircle,
  ArrowRight,
  Building,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SunMark } from "../components/RiskSun";
import { useApp } from "../state/AppState";

export default function SignUp() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { pushToast, loginAsDemo } = useApp();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"FARMER" | "COOP" | "PROCESSOR" | "DISTRIBUTOR" | "RETAILER" | "AUDITOR">("FARMER");
  const [organization, setOrganization] = useState("");
  const [location, setLocation] = useState("Maharashtra, IN");

  // Email verification state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submit Sign-Up to Clerk
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setLoading(true);
    setError(null);

    try {
      const parts = fullName.trim().split(" ");
      const firstName = parts[0] || "Agri";
      const lastName = parts.slice(1).join(" ") || "Participant";

      const res = await signUp.create({
        emailAddress: email,
        password: password,
        firstName,
        lastName,
        unsafeMetadata: {
          role,
          organization: organization || fullName,
          location,
        },
      });

      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        pushToast({
          tone: "ok",
          title: "Account Created Successfully",
          body: `Welcome to AgriChain Sentinel as ${role}`,
        });

        // Set local session
        loginAsDemo({
          id: `USR-${Date.now().toString().slice(-6)}`,
          username: email.split("@")[0],
          name: fullName,
          email,
          role,
          participant_id: `${role[0]}-${Math.floor(100 + Math.random() * 900)}`,
        });

        navigate(role === "AUDITOR" ? "/admin" : "/portal");
      } else {
        // Send email OTP verification code
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setPendingVerification(true);
        pushToast({
          tone: "info",
          title: "Verification Code Sent",
          body: `Please enter the 6-digit verification code sent to ${email}`,
        });
      }
    } catch (err: any) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "Failed to create account. Please check your inputs.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP Code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setLoading(true);
    setError(null);

    try {
      const res = await signUp.attemptEmailAddressVerification({ code });

      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        pushToast({
          tone: "ok",
          title: "Email Verified & Account Activated",
          body: `Registered as ${role} for ${organization || fullName}`,
        });

        loginAsDemo({
          id: `USR-${Date.now().toString().slice(-6)}`,
          username: email.split("@")[0],
          name: fullName,
          email,
          role,
          participant_id: `${role[0]}-${Math.floor(100 + Math.random() * 900)}`,
        });

        navigate(role === "AUDITOR" ? "/admin" : "/portal");
      } else {
        setError("Verification was not completed. Please verify the code and try again.");
      }
    } catch (err: any) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "Invalid verification code.";
      setError(msg);
    } finally {
      setLoading(false);
    }
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
            <span className="block text-xs font-bold tracking-[0.3em] text-gold uppercase">NETWORK ENROLLMENT</span>
          </div>
          <p className="text-xs text-muted max-w-md mx-auto">
            Register your agricultural entity on the tamper-evident ledger network.
          </p>
        </div>

        {/* Form Container */}
        <div className="rounded-3xl border border-line bg-panel p-6 shadow-xl space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Lock size={16} className="text-gold" />
              {pendingVerification ? "Verify Your Email Address" : "Create Organization Account"}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {pendingVerification
                ? `Enter the 6-digit confirmation code delivered to ${email}`
                : "Provide your entity details and assign your supply-chain role."}
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-quar/50 bg-quar/10 p-3 text-xs text-quar flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!pendingVerification ? (
            <form onSubmit={handleSignUp} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                    <User size={13} className="text-gold" /> Full Name / Contact Person
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ramesh Patil"
                    className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                    <Mail size={13} className="text-gold" /> Official Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. ramesh@kisanfarm.in"
                    className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                    <KeyRound size={13} className="text-gold" /> Account Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                    <Shield size={13} className="text-gold" /> Supply-Chain Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink focus:border-gold focus:outline-none font-semibold"
                  >
                    <option value="FARMER">Farmer / Primary Producer</option>
                    <option value="COOP">Cooperative Aggregator</option>
                    <option value="PROCESSOR">Industrial Processor</option>
                    <option value="DISTRIBUTOR">Cold-Chain Logistics</option>
                    <option value="RETAILER">Consumer Retailer</option>
                    <option value="AUDITOR">Compliance Auditor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                    <Building size={13} className="text-gold" /> Entity / Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g. Kisan Agro Orchards Pvt Ltd"
                    className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-muted block mb-1 font-semibold flex items-center gap-1.5">
                    <MapPin size={13} className="text-gold" /> Operating Location
                  </label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Solapur, Maharashtra"
                    className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !isLoaded}
                className="btn-gold w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? "Registering on Ledger..." : "Create Account & Enroll"}
                <ArrowRight size={14} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-xs">
              <div>
                <label className="text-muted block mb-1 font-semibold">Verification Code</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="w-full rounded-xl border border-line bg-panel-2 p-3 text-sm text-center tracking-widest font-mono text-gold focus:border-gold focus:outline-none font-bold"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !isLoaded}
                className="btn-gold w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? "Verifying..." : "Confirm & Activate Identity"}
                <CheckCircle2 size={14} />
              </button>
            </form>
          )}

          <div className="pt-2 border-t border-line/60 flex items-center justify-between text-xs text-muted">
            <span>Already registered?</span>
            <Link to="/login" className="text-gold font-bold hover:underline">
              Sign In to Existing Account →
            </Link>
          </div>
        </div>

        {/* Security Footer Notice */}
        <div className="text-center text-[11px] text-muted flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Non-Custodial Cryptographic Security & Role-Based Access Enforcement</span>
        </div>
      </div>
    </div>
  );
}
