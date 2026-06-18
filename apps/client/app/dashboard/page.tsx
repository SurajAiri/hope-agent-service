"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api"
import { Activity, Users, KeyRound, Zap, MailPlus, Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function DashboardOverview() {
  const { organizations, selectedOrgId, fetchOrganizations } = useAppStore()
  const org = organizations.find((o) => o.id === selectedOrgId)

  const [invitations, setInvitations] = useState<any[]>([])
  const [isLoadingInvites, setIsLoadingInvites] = useState(true)

  useEffect(() => {
    const fetchInvites = async () => {
      try {
        const response = await api.get('/users/me/invitations')
        setInvitations(Array.isArray(response) ? response : response.data || [])
      } catch (err) {
        console.error("Failed to load invitations", err)
      } finally {
        setIsLoadingInvites(false)
      }
    }
    fetchInvites()
  }, [])

  const handleAccept = async (orgId: string) => {
    try {
      await api.post(`/organizations/${orgId}/members/accept`, {})
      toast.success("Invitation accepted!")
      setInvitations(invites => invites.filter(i => i.organization.id !== orgId))
      await fetchOrganizations()
    } catch(err: any) {
      toast.error(err.message || "Failed to accept invitation")
    }
  }

  const handleReject = async (orgId: string) => {
    try {
      await api.post(`/organizations/${orgId}/members/reject`, {})
      toast.success("Invitation rejected")
      setInvitations(invites => invites.filter(i => i.organization.id !== orgId))
    } catch(err: any) {
      toast.error(err.message || "Failed to reject invitation")
    }
  }

  const stats = [
    { name: "Active Agents", value: "12", icon: Zap, change: "+2 from last week" },
    { name: "Total API Requests", value: "1.2m", icon: Activity, change: "+15% from last month" },
    { name: "Team Members", value: "4", icon: Users, change: "No change" },
    { name: "Active Tokens", value: "3", icon: KeyRound, change: "+1 recently created" },
  ]

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-2">
          Here&apos;s what&apos;s happening in {org?.name || "your organization"}.
        </p>
      </div>

      <AnimatePresence>
        {!isLoadingInvites && invitations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <h2 className="text-lg font-semibold flex items-center text-amber-500">
              <MailPlus className="mr-2 h-5 w-5" /> Pending Invitations
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {invitations.map((invite) => (
                <Card key={invite.membership.id} className="border-amber-500/30 bg-amber-500/5">
                  <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{invite.organization.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        You have been invited as a <span className="capitalize text-foreground font-medium">{invite.membership.role}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button variant="outline" size="sm" onClick={() => handleReject(invite.organization.id)} className="w-full sm:w-auto">
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => handleAccept(invite.organization.id)} className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-amber-950">
                        <Check className="h-4 w-4 mr-1" /> Accept
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {stats.map((stat, index) => (
          <motion.div key={index} variants={item}>
            <Card glass className="relative overflow-hidden group hover:border-primary/50 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium">
                  {stat.name}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-7"
      >
        <Card glass className="col-span-4">
          <CardHeader>
            <CardTitle>Usage Overview</CardTitle>
            <CardDescription>
              API request volume over the last 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center border-t border-white/5">
            <span className="text-muted-foreground">Chart placeholder</span>
          </CardContent>
        </Card>
        <Card glass className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest actions across your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="border-t border-white/5 pt-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-2 w-2 rounded-full bg-primary/50" />
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">New API Token created</p>
                  <p className="text-xs text-muted-foreground">2 hours ago by You</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
