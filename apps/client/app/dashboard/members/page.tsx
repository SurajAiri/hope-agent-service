"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Modal } from "@/components/ui/Modal"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useAppStore } from "@/lib/store"
import { api } from "@/lib/api"
import { UserPlus, Mail, Shield, Trash2, Loader2, Clock } from "lucide-react"
import { toast } from "sonner"

export default function MembersPage() {
  const { user, organizations, selectedOrgId } = useAppStore()
  const org = organizations.find(o => o.id === selectedOrgId)
  
  const [members, setMembers] = useState<any[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("member")
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  // Current user's role in this org directly from state (fixes missing button bug)
  const currentUserRole = org?.role || "member"

  useEffect(() => {
    if (org && currentUserRole === "member") {
      window.location.href = "/dashboard"
    }
  }, [org, currentUserRole])

  useEffect(() => {
    const fetchMembers = async () => {
      if (!selectedOrgId || currentUserRole === "member") return
      setIsLoadingMembers(true)
      try {
        const response = await api.get(`/organizations/${selectedOrgId}/members`)
        const rawMembers = Array.isArray(response) ? response : response.data || []
        
        const formattedMembers = rawMembers.map((item: any) => {
          const userObj = item.user || {}
          const membership = item.membership || {}
          
          return {
            user: {
              id: userObj.id,
              name: `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() || userObj.email || 'Unknown User',
              email: userObj.email
            },
            role: membership.role || item.role || 'member',
            status: membership.status || item.status || 'active'
          }
        })
        
        setMembers(formattedMembers)
      } catch (err) {
        console.error("Failed to fetch members", err)
      } finally {
        setIsLoadingMembers(false)
      }
    }
    
    fetchMembers()
  }, [selectedOrgId])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrgId) return

    setIsInviting(true)
    setError(null)
    try {
      await api.post(`/organizations/${selectedOrgId}/members`, { email, role })
      
      // Refresh members
      const response = await api.get(`/organizations/${selectedOrgId}/members`)
      const rawMembers = Array.isArray(response) ? response : response.data || []
      
      const formattedMembers = rawMembers.map((item: any) => {
        const userObj = item.user || {}
        const membership = item.membership || {}
        return {
          user: {
            id: userObj.id,
            name: `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() || userObj.email || 'Unknown User',
            email: userObj.email
          },
          role: membership.role || item.role || 'member',
          status: membership.status || item.status || 'active'
        }
      })
      
      setMembers(formattedMembers)
      toast.success("Invitation sent successfully!")
      
      setIsModalOpen(false)
      setEmail("")
      setRole("member")
    } catch (err: any) {
      setError(err.message || "Failed to invite member")
      toast.error("Failed to invite member")
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemove = async () => {
    if (!selectedOrgId || !deleteUserId) return
    
    setIsRemoving(true)
    try {
      await api.delete(`/organizations/${selectedOrgId}/members/${deleteUserId}`)
      setMembers(members.filter(m => m.user.id !== deleteUserId))
      toast.success("Member removed successfully")
      setDeleteUserId(null)
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member")
    } finally {
      setIsRemoving(false)
    }
  }

  const handleRoleChange = async (targetId: string, newRole: string) => {
    if (!selectedOrgId) return
    
    try {
      await api.patch(`/organizations/${selectedOrgId}/members/${targetId}`, { role: newRole })
      setMembers(members.map(m => m.user.id === targetId ? { ...m, role: newRole } : m))
      toast.success("Role updated successfully")
    } catch (err: any) {
      toast.error(err.message || "Failed to update role")
    }
  }

  const canRemove = (targetRole: string, targetId: string) => {
    if (currentUserRole === "member") return false
    if (targetRole === "owner") return false
    if (targetId === user?.id) return false // can't remove self from this UI
    if (currentUserRole === "admin" && targetRole === "admin") return false
    return true
  }

  const canChangeRole = (targetRole: string, targetId: string) => {
    if (currentUserRole === "member") return false
    if (targetRole === "owner") return false
    if (targetId === user?.id) return false
    if (currentUserRole === "admin" && targetRole === "admin") return false
    return true
  }

  const canInvite = currentUserRole === "owner" || currentUserRole === "admin"

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-2">
            Manage who has access to {org?.name || "this organization"}.
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setIsModalOpen(true)} disabled={!selectedOrgId}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      <Card glass>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-white/5 border-b border-card-border text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingMembers ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    No members found. Invite someone to get started.
                  </td>
                </tr>
              ) : (
                members.map((member, i) => (
                  <motion.tr 
                    key={member.user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors last:border-0"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                          {member.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {member.user.name}
                            {member.user.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center mt-0.5">
                            <Mail className="h-3 w-3 mr-1" />
                            {member.user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {member.status === 'pending' ? (
                        <span className="inline-flex items-center text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded-full">
                          <Clock className="h-3 w-3 mr-1" /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs bg-green-500/20 text-green-500 px-2 py-1 rounded-full">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {canChangeRole(member.role, member.user.id) ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                          className="bg-transparent border border-white/10 rounded px-2 py-1 text-sm text-foreground focus:ring-1 focus:ring-primary"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <div className="flex items-center text-muted-foreground capitalize">
                          <Shield className="h-4 w-4 mr-2" />
                          {member.role}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canRemove(member.role, member.user.id) && (
                        member.status === 'pending' ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              // We can reuse the remove handler for canceling
                              setDeleteUserId(member.user.id)
                            }}
                            className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-600"
                          >
                            Cancel Invite
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setDeleteUserId(member.user.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Invite Team Member"
        description={`Send an invitation to join ${org?.name}.`}
      >
        <form onSubmit={handleInvite} className="space-y-4">
          {error && (
            <div className="p-3 text-sm rounded-md bg-destructive/10 text-red-500 border border-destructive/20">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="email">
              Email Address
            </label>
            <Input 
              id="email" 
              type="email"
              placeholder="colleague@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Role
            </label>
            <select 
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 [&>option]:bg-background"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isInviting}>
              {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invite
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteUserId}
        onClose={() => setDeleteUserId(null)}
        onConfirm={handleRemove}
        title="Remove Member"
        description="Are you sure you want to remove this member from the organization? They will lose all access immediately."
        confirmText="Remove Member"
        isDestructive
        isLoading={isRemoving}
      />
    </div>
  )
}
