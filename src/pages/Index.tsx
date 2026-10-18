import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@radix-ui/themes";
import { Heart, Search, Utensils, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import { getPublicImpactMetrics } from "@/services/metrics";
import type { ImpactMetrics } from "@/types/metrics";
import { APP_NAME, APP_TAGLINE } from "@/config/brand";

const stats = [
  { icon: Heart, label: "Total Donors", key: "totalDonors" },
  { icon: Users, label: "Total Recipients", key: "totalRecipients" },
  { icon: Utensils, label: "Meals Saved", key: "totalMealsSaved" },
] as const;

const steps = [
  {
    icon: Utensils,
    title: "Post Surplus Food",
    desc: "Share extra food in seconds with details like quantity, pickup location, and availability.",
  },
  {
    icon: Search,
    title: "Claim Nearby Supplies",
    desc: "Browse real-time local donations and request what your community or organization needs.",
  },
  {
    icon: Heart,
    title: "Bridge the Gap",
    desc: "Keep fresh food out of landfills while making a direct impact in your neighborhood.",
  },
];

const Index = () => {
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);

  useEffect(() => {
    let mounted = true;
    getPublicImpactMetrics()
      .then((data) => {
        if (mounted) setMetrics(data);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />

      <main className="min-h-0 flex-1 overflow-y-auto">
        {/* Hero */}
        <section className="relative isolate overflow-hidden px-4 py-24 text-center md:py-32">
          <img
            src="/background_image.jpeg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-20 h-full w-full scale-105 object-cover object-center blur-[2px]"
          />
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-br from-black/70 via-primary/60 to-black/65"
            aria-hidden="true"
          />
          <div className="container mx-auto px-6 py-10">
            <h1 className="text-4xl md:text-6xl font-heading font-bold text-primary-foreground mb-6 animate-fade-up tracking-tight drop-shadow-lg">
              {APP_TAGLINE}
            </h1>
            <p
              className="text-lg md:text-xl text-primary-foreground/90 mb-10 max-w-2xl mx-auto font-medium leading-relaxed drop-shadow-md"
              style={{ animationDelay: "0.15s", animationFillMode: "both" }}
            >
              Every day, tons of fresh food are thrown away while local families
              go hungry. {APP_NAME} bridges the gap by connecting donors with
              nearby food pantries and neighbors instantly.
            </p>
            <div
              className="flex flex-col sm:flex-row gap-4 justify-center"
              style={{ animationDelay: "0.3s", animationFillMode: "both" }}
            >
              <Link to="/signup?role=donor">
                <Button
                  size="3"
                  className="bg-primary text-white hover:bg-primary/90 font-semibold text-base px-8"
                >
                  <Heart className="mr-2 h-5 w-5" /> Donate Food
                </Button>
              </Link>
              <Link to="/signup?role=receiver">
                <Button
                  size="3"
                  className="bg-primary text-white hover:bg-primary/90 font-semibold text-base px-8"
                >
                  <Search className="mr-2 h-5 w-5" /> Find Food
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 px-4 bg-background">
          <div className="container mx-auto max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-8">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center text-center"
              >
                <s.icon className="h-8 w-8 text-primary mb-3" />
                <p className="text-3xl font-heading font-bold text-foreground">
                  {metrics ? metrics[s.key].toLocaleString() : "—"}
                </p>
                <p className="text-muted-foreground text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
        {/* How it works */}
        <section className="py-20 px-4 bg-secondary">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-heading font-bold text-foreground mb-12">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-card p-8 card-shadow hover:card-shadow-hover transition-shadow duration-300"
                >
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-5">
                    <step.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-heading font-bold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <footer className="border-t py-2 px-4 text-center text-muted-foreground text-sm">
          <p>
            © {new Date().getFullYear()} {APP_NAME} — {APP_TAGLINE}
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Index;
