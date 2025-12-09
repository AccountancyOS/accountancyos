import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bell, Check, Mail, Settings, Users } from "lucide-react";

const ColorComparison = () => {
  return (
    <div className="min-h-screen p-8 space-y-12">
      <h1 className="text-3xl font-bold text-center mb-8">Color Palette Comparison</h1>
      
      {/* CURRENT PALETTE */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold border-b pb-2">1. Current Palette (Blue-Grey)</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Color Swatches */}
          <div className="space-y-4">
            <h3 className="font-medium">Color Swatches</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <div className="h-16 rounded-lg bg-background border"></div>
                <p className="text-xs text-center">Background</p>
              </div>
              <div className="space-y-1">
                <div className="h-16 rounded-lg bg-primary"></div>
                <p className="text-xs text-center">Primary</p>
              </div>
              <div className="space-y-1">
                <div className="h-16 rounded-lg bg-secondary"></div>
                <p className="text-xs text-center">Secondary</p>
              </div>
              <div className="space-y-1">
                <div className="h-16 rounded-lg bg-accent border"></div>
                <p className="text-xs text-center">Accent</p>
              </div>
              <div className="space-y-1">
                <div className="h-16 rounded-lg bg-muted"></div>
                <p className="text-xs text-center">Muted</p>
              </div>
              <div className="space-y-1">
                <div className="h-16 rounded-lg bg-card border"></div>
                <p className="text-xs text-center">Card</p>
              </div>
              <div className="space-y-1">
                <div className="h-16 rounded-lg bg-destructive"></div>
                <p className="text-xs text-center">Destructive</p>
              </div>
              <div className="space-y-1">
                <div className="h-16 rounded-lg border-2 border-border"></div>
                <p className="text-xs text-center">Border</p>
              </div>
            </div>
          </div>
          
          {/* Example UI */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Sample Card
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Enter email address..." />
              <div className="flex gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
              </div>
              <div className="flex gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Switch />
                <span className="text-sm text-muted-foreground">Enable notifications</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* PROPOSED PREMIUM FINTECH PALETTE */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold border-b pb-2">2. Premium Fintech Palette (Navy + Teal + Off-White)</h2>
        <div 
          className="rounded-xl p-6 space-y-6"
          style={{ backgroundColor: 'hsl(40 20% 98%)' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Color Swatches */}
            <div className="space-y-4">
              <h3 className="font-medium" style={{ color: 'hsl(220 60% 12%)' }}>Color Swatches</h3>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(40 20% 98%)', border: '1px solid hsl(40 15% 85%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Background</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(220 60% 15%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Primary (Navy)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(220 40% 25%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Secondary</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(173 58% 39%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Accent (Teal)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(40 10% 90%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Muted</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(40 15% 99%)', border: '1px solid hsl(40 15% 85%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Card</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(0 72% 50%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Destructive</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ border: '2px solid hsl(40 15% 85%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(220 60% 12%)' }}>Border</p>
                </div>
              </div>
            </div>
            
            {/* Example UI */}
            <div 
              className="rounded-xl p-6 space-y-4"
              style={{ backgroundColor: 'hsl(40 15% 99%)', border: '1px solid hsl(40 15% 85%)' }}
            >
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'hsl(220 60% 12%)' }}>
                <Users className="h-5 w-5" style={{ color: 'hsl(173 58% 39%)' }} />
                Sample Card
              </h3>
              <input 
                placeholder="Enter email address..." 
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ 
                  backgroundColor: 'hsl(40 20% 98%)', 
                  border: '1px solid hsl(40 15% 85%)',
                  color: 'hsl(220 60% 12%)'
                }}
              />
              <div className="flex gap-2 flex-wrap">
                <button 
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: 'hsl(220 60% 15%)', color: 'hsl(40 20% 98%)' }}
                >
                  Primary
                </button>
                <button 
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: 'hsl(173 58% 39%)', color: 'white' }}
                >
                  Teal Accent
                </button>
                <button 
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: 'transparent', border: '1px solid hsl(220 60% 15%)', color: 'hsl(220 60% 15%)' }}
                >
                  Outline
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'hsl(220 60% 15%)', color: 'hsl(40 20% 98%)' }}>Default</span>
                <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'hsl(173 58% 39%)', color: 'white' }}>Teal</span>
                <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'transparent', border: '1px solid hsl(220 60% 15%)', color: 'hsl(220 60% 15%)' }}>Outline</span>
              </div>
            </div>
          </div>
          
          {/* Sidebar Preview */}
          <div className="mt-6">
            <h3 className="font-medium mb-3" style={{ color: 'hsl(220 60% 12%)' }}>Sidebar Preview</h3>
            <div 
              className="rounded-xl p-4 w-64 space-y-2"
              style={{ backgroundColor: 'hsl(220 60% 15%)' }}
            >
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'hsl(173 58% 39%)' }}>
                <Mail className="h-4 w-4 text-white" />
                <span className="text-white text-sm font-medium">Emails</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10">
                <Users className="h-4 w-4" style={{ color: 'hsl(40 20% 85%)' }} />
                <span className="text-sm" style={{ color: 'hsl(40 20% 85%)' }}>Clients</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10">
                <Settings className="h-4 w-4" style={{ color: 'hsl(40 20% 85%)' }} />
                <span className="text-sm" style={{ color: 'hsl(40 20% 85%)' }}>Settings</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DARK MOODY PALETTE (from reference image) */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold border-b pb-2">3. Dark Moody Palette (from Reference Image)</h2>
        <div 
          className="rounded-xl p-6 space-y-6"
          style={{ backgroundColor: 'hsl(220 30% 8%)' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Color Swatches */}
            <div className="space-y-4">
              <h3 className="font-medium" style={{ color: 'hsl(210 20% 90%)' }}>Color Swatches</h3>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(220 30% 8%)', border: '1px solid hsl(220 20% 20%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Background</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(200 80% 50%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Primary (Blue)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(220 25% 15%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Secondary</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(190 70% 50%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Accent (Cyan)</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(220 20% 18%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Muted</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(220 25% 12%)', border: '1px solid hsl(220 20% 20%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Card</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ backgroundColor: 'hsl(0 70% 55%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Destructive</p>
                </div>
                <div className="space-y-1">
                  <div className="h-16 rounded-lg" style={{ border: '2px solid hsl(220 20% 25%)' }}></div>
                  <p className="text-xs text-center" style={{ color: 'hsl(210 20% 70%)' }}>Border</p>
                </div>
              </div>
            </div>
            
            {/* Example UI */}
            <div 
              className="rounded-xl p-6 space-y-4"
              style={{ 
                backgroundColor: 'hsl(220 25% 12%)', 
                border: '1px solid hsl(220 20% 20%)',
                boxShadow: '0 0 60px hsl(200 80% 50% / 0.1)'
              }}
            >
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'hsl(210 20% 95%)' }}>
                <Users className="h-5 w-5" style={{ color: 'hsl(200 80% 50%)' }} />
                Sample Card
              </h3>
              <input 
                placeholder="Enter email address..." 
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ 
                  backgroundColor: 'hsl(220 30% 8%)', 
                  border: '1px solid hsl(220 20% 25%)',
                  color: 'hsl(210 20% 90%)'
                }}
              />
              <div className="flex gap-2 flex-wrap">
                <button 
                  className="px-4 py-2 rounded-full text-sm font-medium"
                  style={{ 
                    background: 'linear-gradient(135deg, hsl(200 80% 50%), hsl(190 70% 45%))', 
                    color: 'white',
                    boxShadow: '0 0 20px hsl(200 80% 50% / 0.4)'
                  }}
                >
                  Start working now →
                </button>
                <button 
                  className="px-4 py-2 rounded-full text-sm font-medium"
                  style={{ backgroundColor: 'transparent', border: '1px solid hsl(220 20% 30%)', color: 'hsl(210 20% 80%)' }}
                >
                  Outline
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'hsl(200 80% 50%)', color: 'white' }}>Blue</span>
                <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'hsl(190 70% 50%)', color: 'hsl(220 30% 8%)' }}>Cyan</span>
                <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'transparent', border: '1px solid hsl(220 20% 30%)', color: 'hsl(210 20% 80%)' }}>Outline</span>
              </div>
            </div>
          </div>
          
          {/* Hero Preview */}
          <div className="mt-6">
            <h3 className="font-medium mb-3" style={{ color: 'hsl(210 20% 90%)' }}>Hero Section Style</h3>
            <div 
              className="rounded-xl p-8 text-center relative overflow-hidden"
              style={{ 
                backgroundColor: 'hsl(220 30% 6%)',
                background: 'radial-gradient(ellipse at center bottom, hsl(200 80% 20% / 0.3), transparent 60%)'
              }}
            >
              <div className="absolute inset-0 opacity-30" style={{
                background: 'radial-gradient(circle at 50% 100%, hsl(200 80% 50% / 0.4), transparent 50%)'
              }}></div>
              <h2 className="text-3xl font-bold mb-3 relative" style={{ color: 'hsl(210 20% 95%)' }}>
                Build, deploy & scale AI
              </h2>
              <p className="text-sm mb-6 relative" style={{ color: 'hsl(210 20% 60%)' }}>
                Transforming complex AI implementation into autonomous workflows.
              </p>
              <button 
                className="px-6 py-3 rounded-full text-sm font-medium relative"
                style={{ 
                  background: 'linear-gradient(135deg, hsl(200 80% 50%), hsl(190 70% 45%))', 
                  color: 'white',
                  boxShadow: '0 0 30px hsl(200 80% 50% / 0.5)'
                }}
              >
                Start working now →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="rounded-xl border p-6 bg-card">
        <h2 className="text-xl font-semibold mb-4">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-2">
            <h3 className="font-medium">Current (Blue-Grey)</h3>
            <ul className="text-muted-foreground space-y-1">
              <li>• Cool, corporate feel</li>
              <li>• Neutral, professional</li>
              <li>• Less differentiated</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Premium Fintech (Navy + Teal)</h3>
            <ul className="text-muted-foreground space-y-1">
              <li>• Trust + Innovation</li>
              <li>• Warm off-white = readable</li>
              <li>• Teal accent = modern, automated</li>
              <li>• Great for light mode</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Dark Moody (Blue Glow)</h3>
            <ul className="text-muted-foreground space-y-1">
              <li>• Dramatic, tech-forward</li>
              <li>• Glowing blue accents</li>
              <li>• Best for dark mode / SaaS</li>
              <li>• May feel less "accountancy"</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ColorComparison;
