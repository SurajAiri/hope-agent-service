"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api"
import { Building2, Plus, ArrowRight, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export default function OrganizationsPage() {
  const { organizations, selectedOrgId, setSelectedOrgId, fetchOrganizations } = useAppStore()
  const router = useRouter()
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [newOrgSlug, setNewOrgSlug] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [invitations, setInvitations] = useState<any[]>([])

  useEffect(() => {
    const fetchInvites = async () => {
      try {
        const response = await api.get('/users/me/invitations')
        setInvitations(Array.isArray(response) ? response : response.data || [])
      } catch (err) {
        console.error("Failed to load invitations", err)
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

  const activeOrg = organizations.find((o) => o.id === selectedOrgId)
  const isOwner = activeOrg?.role === "owner"

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value
    setNewOrgName(name)
    setNewOrgSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOrgName.trim() || !newOrgSlug.trim()) return

    setIsLoading(true)
    setError(null)
    
    try {
      const response = await api.post("/organizations", { 
        name: newOrgName,
        slug: newOrgSlug 
      })
      await fetchOrganizations() // Refresh list
      
      const newOrgId = response.id || response.data?.id
      if (newOrgId) {
        setSelectedOrgId(newOrgId)
      }
      
      setIsModalOpen(false)
      setNewOrgName("")
      setNewOrgSlug("")
      toast.success("Organization created successfully!")
    } catch (err: any) {
      setError(err.message || "Failed to create organization")
      toast.error("Failed to create organization")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organizations and switch contexts.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
      </div>

      {invitations.length > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold flex items-center text-amber-500">
            Pending Invitations
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {invitations.map((invite) => (
              <Card key={invite.membership.id} className="border-amber-500/30 bg-amber-500/5">
                <div className="p-4 flex flex-col items-start gap-4">
                  <div>
                    <h3 className="font-semibold">{invite.organization.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Invited as <span className="capitalize text-foreground font-medium">{invite.membership.role}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full mt-2">
                    <Button variant="outline" size="sm" onClick={() => handleReject(invite.organization.id)} className="w-full">
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => handleAccept(invite.organization.id)} className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950">
                      Accept
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {organizations.map((org, i) => (
          <motion.div
            key={org.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card 
              glass 
              className={`relative overflow-hidden group transition-all duration-300 ${
                selectedOrgId === org.id ? "border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)]" : "hover:border-white/20"
              }`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10 group-hover:bg-primary/10 transition-colors">
                    <Building2 className={`h-5 w-5 ${selectedOrgId === org.id ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                  </div>
                  {selectedOrgId === org.id && (
                    <span className="text-xs font-medium bg-primary/20 text-primary px-2 py-1 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <CardTitle className="mt-4">{org.name}</CardTitle>
                <CardDescription>Role: {org.role || 'Member'}</CardDescription>
              </CardHeader>
              <CardContent>
                {selectedOrgId !== org.id && (
                  <Button 
                    variant="outline" 
                    className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      setSelectedOrgId(org.id)
                      toast.success(`Switched context to ${org.name}`)
                    }}
                  >
                    Switch Context
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
        {organizations.length === 0 && (
          <div className="col-span-full p-12 text-center text-muted-foreground border rounded-xl border-dashed border-card-border">
            You don't belong to any organizations. Create one to get started.
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Organization"
        description="Add a new organization to group your agents and members."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="p-3 text-sm rounded-md bg-destructive/10 text-red-500 border border-destructive/20">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="orgName">
              Organization Name
            </label>
            <Input 
              id="orgName" 
              placeholder="e.g. Acme Corp" 
              value={newOrgName}
              onChange={handleNameChange}
              required 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="orgSlug">
              Organization URL Slug
            </label>
            <Input 
              id="orgSlug" 
              placeholder="e.g. acme-corp" 
              value={newOrgSlug}
              onChange={(e) => setNewOrgSlug(e.target.value)}
              required 
            />
            <p className="text-xs text-muted-foreground">
              This will be used in your API URLs and cannot be changed later.
            </p>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
