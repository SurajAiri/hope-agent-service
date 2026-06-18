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
import { KeyRound, Plus, Copy, Check, Trash2, ShieldAlert, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function TokensPage() {
  const { user, organizations, selectedOrgId } = useAppStore()
  const activeOrg = organizations.find(o => o.id === selectedOrgId)
  
  const [tokens, setTokens] = useState<any[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tokenName, setTokenName] = useState("")
  const [description, setDescription] = useState("")
  const [expiresIn, setExpiresIn] = useState("never")
  const [customExpiryDate, setCustomExpiryDate] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [newTokenString, setNewTokenString] = useState<string | null>(null)

  const [deleteTokenId, setDeleteTokenId] = useState<string | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  const canManageTokens = activeOrg?.role === "owner" || activeOrg?.role === "admin"

  useEffect(() => {
    const fetchTokens = async () => {
      if (!selectedOrgId) return
      setIsLoadingTokens(true)
      try {
        const response = await api.get(`/organizations/${selectedOrgId}/apikeys`)
        setTokens(Array.isArray(response) ? response : response.data || [])
      } catch (err) {
        console.error("Failed to fetch tokens", err)
      } finally {
        setIsLoadingTokens(false)
      }
    }
    
    fetchTokens()
  }, [selectedOrgId])

  const calculateExpiryDate = () => {
    if (expiresIn === "never") return null
    if (expiresIn === "custom" && customExpiryDate) return customExpiryDate
    
    const date = new Date()
    if (expiresIn === "1d") date.setDate(date.getDate() + 1)
    if (expiresIn === "7d") date.setDate(date.getDate() + 7)
    
    return date.toISOString()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tokenName.trim() || !selectedOrgId) return

    setIsGenerating(true)
    setError(null)
    
    try {
      const expiresAt = calculateExpiryDate()
      
      const response = await api.post(`/organizations/${selectedOrgId}/apikeys`, { 
        name: tokenName,
        description,
        expiresAt
      })
      
      const newKey = response.key || response.data?.key
      
      // Refresh tokens
      const listResponse = await api.get(`/organizations/${selectedOrgId}/apikeys`)
      setTokens(Array.isArray(listResponse) ? listResponse : listResponse.data || [])
      
      setNewTokenString(newKey)
      setTokenName("")
      setDescription("")
      setExpiresIn("never")
      setCustomExpiryDate("")
      toast.success("API Token generated successfully!")
    } catch (err: any) {
      setError(err.message || "Failed to generate token")
      toast.error("Failed to generate token")
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success("Token copied to clipboard")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRevoke = async () => {
    if (!selectedOrgId || !deleteTokenId) return
    
    setIsRevoking(true)
    try {
      await api.delete(`/organizations/${selectedOrgId}/apikeys/${deleteTokenId}`)
      setTokens(tokens.filter(t => t.id !== deleteTokenId))
      toast.success("API Token revoked successfully")
      setDeleteTokenId(null)
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke token")
    } finally {
      setIsRevoking(false)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setNewTokenString(null)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Tokens</h1>
          <p className="text-muted-foreground mt-2">
            Generate and manage API keys for your applications.
          </p>
        </div>
        {canManageTokens && (
          <Button onClick={() => setIsModalOpen(true)} disabled={!selectedOrgId}>
            <Plus className="mr-2 h-4 w-4" />
            Generate Token
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {isLoadingTokens ? (
          <div className="p-12 flex justify-center border rounded-xl border-dashed border-card-border">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : tokens.length === 0 ? (
          <Card glass className="p-12 text-center text-muted-foreground">
            No API tokens found. Generate one to start making requests.
          </Card>
        ) : (
          tokens.map((token, i) => {
            const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date()
            
            return (
            <motion.div
              key={token.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card glass className={`flex items-center justify-between p-6 ${isExpired ? 'opacity-60 grayscale' : ''}`}>
                <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-xl mt-1 ${isExpired ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                    <KeyRound className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {token.name}
                      {isExpired && <span className="text-xs font-normal bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">Expired</span>}
                    </h3>
                    <div className="flex items-center mt-2 space-x-2">
                      <code className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-muted-foreground">
                        ak_{token.id.substring(0, 8)}...
                      </code>
                    </div>
                    <div className="flex items-center mt-2 text-xs text-muted-foreground space-x-4">
                      <span>Created: {new Date(token.createdAt).toLocaleDateString()}</span>
                      {token.expiresAt && (
                        <span className={isExpired ? "text-destructive" : "text-amber-500/80"}>
                          Expires: {new Date(token.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  {canManageTokens && (
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTokenId(token.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          )})
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={newTokenString ? "Save your token!" : "Generate New Token"}
        description={
          newTokenString 
            ? "Please copy this token now. You won't be able to see it again." 
            : "Create a new API token for accessing the Agent as a Service API."
        }
      >
        {!newTokenString ? (
          <form onSubmit={handleCreate} className="space-y-4">
            {error && (
              <div className="p-3 text-sm rounded-md bg-destructive/10 text-red-500 border border-destructive/20">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="tokenName">
                Token Name
              </label>
              <Input 
                id="tokenName" 
                placeholder="e.g. Production Backend" 
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="description">
                Description (Optional)
              </label>
              <Input 
                id="description" 
                placeholder="What is this key for?" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Expiration
              </label>
              <select 
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 [&>option]:bg-background"
              >
                <option value="never">Never expire</option>
                <option value="1d">1 Day</option>
                <option value="7d">7 Days</option>
                <option value="custom">Custom Date</option>
              </select>
            </div>
            
            {expiresIn === "custom" && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-2"
              >
                <label className="text-sm font-medium leading-none" htmlFor="customExpiry">
                  Custom Expiry Date
                </label>
                <Input 
                  id="customExpiry" 
                  type="date"
                  value={customExpiryDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setCustomExpiryDate(e.target.value)}
                  required 
                />
              </motion.div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="ghost" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={isGenerating}>
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/20 flex items-start space-x-3 text-sm text-accent-foreground">
              <ShieldAlert className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <p>For your security, we will only show this token once. If you lose it, you will need to generate a new one.</p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Input 
                value={newTokenString} 
                readOnly 
                className="font-mono text-sm bg-black/50"
              />
              <Button 
                type="button"
                onClick={() => copyToClipboard(newTokenString, 'new-token')}
                className="shrink-0"
                variant={copiedId === 'new-token' ? 'default' : 'outline'}
              >
                {copiedId === 'new-token' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <Button type="button" className="w-full" onClick={handleCloseModal}>
              I have copied my token
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTokenId}
        onClose={() => setDeleteTokenId(null)}
        onConfirm={handleRevoke}
        title="Revoke Token"
        description="Are you sure you want to revoke this API token? Any applications using it will immediately lose access."
        confirmText="Revoke Token"
        isDestructive
        isLoading={isRevoking}
      />
    </div>
  )
}
