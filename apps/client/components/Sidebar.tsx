"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/lib/store"
import { 
  Building2, 
  Users, 
  KeyRound, 
  LayoutDashboard,
  LogOut,
  ChevronDown,
  Settings
} from "lucide-react"

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
  { icon: Building2, label: "Organizations", href: "/dashboard/organizations" },
  { icon: Users, label: "Members", href: "/dashboard/members" },
  { icon: KeyRound, label: "API Tokens", href: "/dashboard/tokens" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, organizations, selectedOrgId, setSelectedOrgId, logout } = useAppStore()
  const selectedOrg = organizations.find((o) => o.id === selectedOrgId)
  
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false)

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOrgDropdownOpen) {
        setIsOrgDropdownOpen(false)
      }
    }
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [isOrgDropdownOpen])

  return (
    <div className="flex h-screen w-64 flex-col border-r border-card-border bg-card/30 backdrop-blur-md">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <span className="text-gradient">AaaS</span> Client
        </Link>
      </div>

      <div className="px-4 pb-4">
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button 
            onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
            className="flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <span className="truncate">{selectedOrg?.name || "Select Org"}</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOrgDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isOrgDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-full flex-col rounded-md border border-card-border bg-card/90 backdrop-blur-xl shadow-xl z-50 overflow-hidden">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => {
                    setSelectedOrgId(org.id)
                    setIsOrgDropdownOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors",
                    selectedOrgId === org.id && "text-primary bg-primary/5"
                  )}
                >
                  {org.name}
                </button>
              ))}
              {organizations.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">No organizations</div>
              )}
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        {menuItems.map((item) => {
          if (item.label === "Members" && selectedOrg?.role === "member") {
            return null
          }

          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center rounded-md px-3 py-2 text-sm font-medium relative transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-md bg-white/10"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <item.icon className={cn("mr-3 h-4 w-4 shrink-0", isActive ? "text-primary" : "")} />
              <span className="relative z-10">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-card-border">
        {user && (
          <div className="mb-4 px-3 flex items-center space-x-3 text-sm">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-destructive"
        >
          <LogOut className="mr-3 h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  )
}
