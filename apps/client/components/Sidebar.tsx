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
  { icon: KeyRound,        label: "API Tokens",     href: "/dashboard/tokens" },
  { icon: Users,           label: "Members",        href: "/dashboard/members", ownerOnly: false },
  { icon: Building2,       label: "Organizations",  href: "/dashboard/organizations" },
  { icon: Settings,        label: "Settings",       href: "/dashboard/settings" },
];

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

  const initials = user
    ? `${user.name?.charAt(0) ?? ""}`.toUpperCase()
    : "?";

  return (
    <aside className="flex h-screen w-[220px] flex-col border-r border-border bg-sidebar shrink-0">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 border border-primary/20">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm tracking-tight">AgentOS</span>
      </div>

      {/* Org switcher */}
      <div className="px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center justify-between rounded-md border border-border bg-secondary/60 px-2.5 py-2 text-xs font-medium transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <span className="truncate text-left max-w-[140px]">
                {selectedOrg?.name ?? "Select organization"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className="flex items-center gap-2 text-xs"
              >
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
            <DropdownMenuItem asChild>
              <Link href="/dashboard/organizations" className="text-xs">
                <Building2 className="h-3.5 w-3.5" />
                Manage organizations
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator className="bg-border/50" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
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
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {item.label}
            </Link>
          );
        })}

        {/* Docs link */}
        <Separator className="my-2 bg-border/50" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-50"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              Documentation
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Coming soon
          </TooltipContent>
        </Tooltip>
      </nav>

      <Separator className="bg-border/50" />

      {/* User footer */}
      <div className="px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <Avatar className="h-6 w-6 border border-border">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden text-left">
                <p className="truncate font-medium">{user?.name ?? "User"}</p>
                <p className="truncate text-muted-foreground text-[10px]">
                  {user?.email ?? ""}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-[200px]">
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="text-xs">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
            </DropdownMenuItem>
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
