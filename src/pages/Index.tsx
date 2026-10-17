import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Search, Leaf, Users, Clock, MapPin } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { APP_NAME } from '@/config/brand';

const stats = [
  { icon: Users, label: 'People Fed', value: '10,000+' },
  { icon: Clock, label: 'Meals Saved', value: '25,000+' },
  { icon: MapPin, label: 'Cities Active', value: '50+' },
];

const steps = [
  { icon: Heart, title: 'Donate Food', desc: 'List surplus food with details like quantity, location, and expiry time.' },
  { icon: Search, title: 'Find Food', desc: 'Browse available food nearby and request what you need.' },
  { icon: Leaf, title: 'Reduce Waste', desc: 'Together we prevent perfectly good food from going to waste.' },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="hero-gradient py-24 px-4 text-center">
        <div className="container mx-auto max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-heading font-bold text-primary-foreground mb-6 animate-fade-up">
            Bridge the Gap Between Surplus & Need
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/90 mb-10 max-w-2xl mx-auto" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
            Every day, tons of good food goes to waste while people go hungry. {APP_NAME} connects food donors with those in need — quickly, simply, locally.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
            <Link to="/signup?role=donor">
              <Button size="lg" className="bg-background text-primary hover:bg-background/90 font-semibold text-base px-8">
                <Heart className="mr-2 h-5 w-5" /> Donate Food
              </Button>
            </Link>
            <Link to="/signup?role=receiver">
              <Button size="lg" variant="outline" className="bg-background text-primary border-background hover:bg-background/90 font-semibold text-base px-8">
                <Search className="mr-2 h-5 w-5" /> Find Food
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 bg-secondary">
        <div className="container mx-auto max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center text-center">
              <s.icon className="h-8 w-8 text-primary mb-3" />
              <p className="text-3xl font-heading font-bold text-foreground">{s.value}</p>
              <p className="text-muted-foreground text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-heading font-bold text-foreground mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="rounded-xl bg-card p-8 card-shadow hover:card-shadow-hover transition-shadow duration-300">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-5">
                  <step.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-heading font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 text-center text-muted-foreground text-sm">
        <p>© {new Date().getFullYear()} {APP_NAME} — Reducing food waste, one meal at a time.</p>
      </footer>
    </div>
  );
}
