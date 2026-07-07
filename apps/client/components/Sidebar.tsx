"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  LayoutDashboard,
  Bot,
  KeyRound,
  Users,
  Building2,
  Settings,
  LogOut,
  ChevronDown,
  BookOpen,
  Check,
  Sparkles,
  Activity,
  BarChart2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const NAV = [
  { icon: LayoutDashboard, label: "Overview",      href: "/dashboard" },
  { icon: Bot,             label: "Agents",         href: "/dashboard/agents" },
  { icon: Activity,        label: "Traces",         href: "/dashboard/traces" },
  { icon: BarChart2,       label: "Analytics",      href: "/dashboard/analytics" },
  { icon: KeyRound,        label: "API Tokens",     href: "/dashboard/tokens" },
  { icon: Users,           label: "Members",        href: "/dashboard/members" },
  { icon: Building2,       label: "Organizations",  href: "/dashboard/organizations" },
  { icon: Settings,        label: "Settings",       href: "/dashboard/settings" },
];

/* Subtle gradient initials color for org/user avatars */
const AVATAR_COLORS = [
  "from-violet-600 to-indigo-600",
  "from-indigo-600 to-blue-600",
  "from-blue-600 to-cyan-600",
  "from-cyan-600 to-emerald-600",
  "from-emerald-600 to-teal-600",
];

function orgColor(name: string) {
  const idx = (name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organizations, selectedOrgId, setSelectedOrgId, logout } =
    useAppStore();

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const userInitials = user
    ? `${user.name?.charAt(0) ?? ""}`.toUpperCase()
    : "?";

  const orgInitial = selectedOrg?.name?.charAt(0).toUpperCase() ?? "?";
  const orgGradient = selectedOrg ? orgColor(selectedOrg.name) : AVATAR_COLORS[0];

  return (
    <aside
      className="flex h-screen w-[240px] flex-col shrink-0 relative"
      style={{
        background: "var(--sidebar)",
        borderRight: "1px solid oklch(1 0 0 / 6%)",
      }}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-white/[0.05]">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{
            background: "linear-gradient(135deg, oklch(0.60 0.22 268), oklch(0.65 0.20 290))",
            boxShadow: "0 2px 8px oklch(0.60 0.22 268 / 40%)",
          }}
        >
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-sm tracking-tight gradient-text">
            Hope
          </span>
          <p className="text-[10px] text-white/30 leading-none mt-0.5">Developer Platform</p>
        </div>
      </div>

      {/* Org switcher */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-1 mb-1.5">
          Organization
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-2 text-xs font-medium transition-all hover:bg-white/[0.07] hover:border-white/[0.12] focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white bg-gradient-to-br",
                    orgGradient,
                  )}
                >
                  {orgInitial}
                </div>
                <span className="truncate text-left flex-1 max-w-[140px]">
                  {selectedOrg?.name ?? "Select organization"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-white/40 shrink-0" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-[220px]">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Switch workspace
            </div>
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className="flex items-center gap-2 text-xs"
              >
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white bg-gradient-to-br",
                    orgColor(org.name),
                  )}
                >
                  {org.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{org.name}</span>
                {org.id === selectedOrgId && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            {organizations.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No organizations
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href="/dashboard/organizations" className="text-xs">
                  <Building2 className="h-3.5 w-3.5" />
                  Manage organizations
                </Link>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator className="bg-white/[0.05]" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-1 mb-2">
          Navigation
        </p>
        {NAV.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-150",
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-white/50 hover:bg-white/[0.05] hover:text-white/80",
              )}
            >
              {/* Active indicator */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4/5 rounded-r-full"
                  style={{
                    background: "linear-gradient(to bottom, oklch(0.75 0.20 268), oklch(0.65 0.22 290))",
                    boxShadow: "0 0 8px oklch(0.65 0.22 268 / 60%)",
                  }}
                />
              )}
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-white/40 group-hover:text-white/60",
                )}
              />
              {item.label}
            </Link>
          );
        })}

        {/* Docs link */}
        <Separator className="my-2 bg-white/[0.05]" />
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-white/25 cursor-not-allowed">
                <BookOpen className="h-4 w-4 shrink-0" />
                Documentation
                <span className="ml-auto text-[9px] bg-white/[0.06] text-white/30 border border-white/[0.08] rounded px-1 py-0.5">
                  Soon
                </span>
              </span>
            }
          />
          <TooltipContent side="right" className="text-xs">
            Coming soon
          </TooltipContent>
        </Tooltip>
      </nav>

      <Separator className="bg-white/[0.05]" />

      {/* User footer */}
      <div className="px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-xs transition-all hover:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback
                    className="text-[10px] font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, oklch(0.60 0.22 268), oklch(0.65 0.20 290))",
                    }}
                  >
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden text-left">
                  <p className="truncate font-semibold text-white/90">{user?.name ?? "User"}</p>
                  <p className="truncate text-white/35 text-[10px]">
                    {user?.email ?? ""}
                  </p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-white/30 shrink-0" />
              </button>
            }
          />
          <DropdownMenuContent align="end" side="top" className="w-[200px]">
            <div className="px-2 py-1.5">
              <p className="text-xs font-semibold truncate">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href="/dashboard/settings" className="text-xs">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Link>
              }
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-xs text-destructive focus:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
