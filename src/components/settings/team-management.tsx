'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissions } from '@/lib/use-permissions';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UserPlus,
  Users,
  Shield,
  Trash2,
  Mail,
  Clock,
  X,
  Crown,
  ChevronDown,
  MoreVertical,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { da } from 'date-fns/locale';

interface Member {
  userId: string;
  email: string;
  businessName: string | null;
  role: string;
  joinedAt: string;
  invitedBy: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

const ROLE_LABELS: Record<string, { da: string; en: string; color: string; icon: typeof Shield }> = {
  OWNER:      { da: 'Ejer', en: 'Owner', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: Crown },
  ADMIN:      { da: 'Administrator', en: 'Admin', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: Shield },
  ACCOUNTANT: { da: 'Bogholder', en: 'Accountant', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', icon: Shield },
  VIEWER:     { da: 'Læser', en: 'Viewer', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300', icon: Users },
  AUDITOR:    { da: 'Revisor', en: 'Auditor', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', icon: Shield },
};

const ROLE_SELECT_OPTIONS = ['ADMIN', 'ACCOUNTANT', 'VIEWER', 'AUDITOR'] as const;

function getRoleLabel(role: string, language: 'da' | 'en') {
  const info = ROLE_LABELS[role] || ROLE_LABELS.VIEWER;
  return language === 'da' ? info.da : info.en;
}

function getRoleColor(role: string) {
  return (ROLE_LABELS[role] || ROLE_LABELS.VIEWER).color;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

// Color palette for avatar backgrounds based on string hash
function getAvatarColor(str: string): string {
  const colors = [
    'bg-[#0d9488]/15 text-[#0d9488]',
    'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    'bg-purple-500/15 text-purple-700 dark:text-purple-400',
    'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    'bg-orange-500/15 text-orange-700 dark:text-orange-400',
    'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function TeamManagement() {
  const user = useAuthStore(state => state.user);
  const { canViewMembers, canInviteMembers, canRemoveMembers, canChangeRoles } = usePermissions();
  const { language } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('VIEWER');
  const [inviteSending, setInviteSending] = useState(false);
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const companyId = user?.activeCompanyId;

  const fetchMembers = useCallback(async () => {
    if (!companyId || !canViewMembers) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch {
      // silently fail
    }
  }, [companyId, canViewMembers]);

  const fetchInvitations = useCallback(async () => {
    if (!companyId || !canViewMembers) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/invitations`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch {
      // silently fail
    }
  }, [companyId, canViewMembers]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMembers(), fetchInvitations()]).finally(() => setLoading(false));
  }, [fetchMembers, fetchInvitations]);

  const handleInvite = async () => {
    if (!inviteEmail || !companyId) return;
    setInviteSending(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(language === 'da' ? 'Invitation sendt!' : 'Invitation sent!');
        setInviteEmail('');
        setInviteRole('VIEWER');
        setInviteOpen(false);
        fetchInvitations();
      } else {
        toast.error(data.error || 'Failed to send invitation');
      }
    } catch {
      toast.error('Failed to send invitation');
    } finally {
      setInviteSending(false);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(
          language === 'da' ? `${name} er fjernet fra teamet` : `${name} has been removed from the team`
        );
        fetchMembers();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to remove member');
      }
    } catch {
      toast.error('Failed to remove member');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        toast.success(language === 'da' ? 'Rolle opdateret' : 'Role updated');
        fetchMembers();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update role');
      }
    } catch {
      toast.error('Failed to update role');
    }
  };

  const handleRevokeInvite = async (inviteId: string, email: string) => {
    if (!companyId) return;
    setRevokingId(inviteId);
    try {
      const res = await fetch(`/api/companies/${companyId}/invitations/${inviteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(
          language === 'da' ? `Invitation til ${email} annulleret` : `Invitation to ${email} revoked`
        );
        fetchInvitations();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to revoke invitation');
      }
    } catch {
      toast.error('Failed to revoke invitation');
    } finally {
      setRevokingId(null);
    }
  };

  if (!canViewMembers) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-5 sm:p-8 text-center text-[#6b7c75]">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>{language === 'da' ? 'Kun administratorer kan se team-medlemmer' : 'Only admins can view team members'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1a2e2a] dark:text-[#e2e8e6]">
            {language === 'da' ? 'Team & Medlemmer' : 'Team & Members'}
          </h3>
          <p className="text-sm text-[#6b7c75]">
            {language === 'da'
              ? 'Administrer hvem der har adgang til dette regnskab'
              : 'Manage who has access to this company'}
          </p>
        </div>
        {canInviteMembers && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white shadow-md hover:shadow-lg transition-all font-medium">
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">{language === 'da' ? 'Inviter medlem' : 'Invite member'}</span>
                <span className="sm:hidden">{language === 'da' ? 'Inviter' : 'Invite'}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white dark:bg-[#1a1f1e] border-0 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="dark:text-white flex items-center gap-2 text-xl">
                  <div className="h-9 w-9 rounded-full bg-[#0d9488]/10 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-[#0d9488]" />
                  </div>
                  {language === 'da' ? 'Inviter teammedlem' : 'Invite team member'}
                </DialogTitle>
                <DialogDescription className="dark:text-gray-400">
                  {language === 'da'
                    ? 'Send en invitation via e-mail. Modtageren skal oprette en konto for at acceptere.'
                    : 'Send an invitation via email. The recipient needs to create an account to accept.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block dark:text-gray-300">
                    {language === 'da' ? 'E-mail adresse' : 'Email address'}
                  </label>
                  <Input
                    type="email"
                    placeholder="name@company.dk"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block dark:text-gray-300">
                    {language === 'da' ? 'Rolle' : 'Role'}
                  </label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="dark:bg-white/5 dark:border-white/10 dark:text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-[#1a1f1e] dark:border-white/10">
                      {ROLE_SELECT_OPTIONS.map(role => (
                        <SelectItem key={role} value={role}>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] px-2 py-0 ${getRoleColor(role)}`}>
                              {getRoleLabel(role, language)}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleInvite}
                  disabled={!inviteEmail || inviteSending}
                  className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white font-medium"
                >
                  {inviteSending
                    ? (language === 'da' ? 'Sender...' : 'Sending...')
                    : (language === 'da' ? 'Send invitation' : 'Send invitation')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Members Grid */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0d9488]" />
              {language === 'da' ? 'Medlemmer' : 'Members'}
              <Badge variant="outline" className="text-xs font-normal dark:border-white/10">{members.length}</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 dark:border-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-10 text-[#6b7c75]">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{language === 'da' ? 'Ingen medlemmer fundet' : 'No members found'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
              {members.map(member => {
                const isCurrentUser = member.userId === user?.id;
                const roleInfo = ROLE_LABELS[member.role] || ROLE_LABELS.VIEWER;
                const RoleIcon = roleInfo.icon;
                const initials = getInitials(member.businessName, member.email);
                const avatarColor = getAvatarColor(member.email);
                const displayName = member.businessName || member.email.split('@')[0];

                return (
                  <div
                    key={member.userId}
                    className={`group relative rounded-xl border p-4 transition-all hover:shadow-md ${
                      isCurrentUser
                        ? 'border-[#0d9488]/30 bg-[#0d9488]/[0.03] dark:bg-[#0d9488]/5 dark:border-[#0d9488]/20'
                        : 'border-gray-100 dark:border-white/5 bg-white dark:bg-white/[0.02] hover:border-gray-200 dark:hover:border-white/10'
                    }`}
                  >
                    {/* Top row: avatar + name + role badge */}
                    <div className="flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor}`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#1a2e2a] dark:text-white truncate">
                            {displayName}
                          </p>
                          {isCurrentUser && (
                            <span className="text-[10px] font-medium text-[#0d9488] bg-[#0d9488]/10 dark:bg-[#0d9488]/20 px-1.5 py-0.5 rounded-full">
                              {language === 'da' ? 'dig' : 'you'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6b7c75] truncate mt-0.5">{member.email}</p>
                      </div>
                    </div>

                    {/* Bottom row: role + actions */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <RoleIcon className="h-3.5 w-3.5 text-[#6b7c75]" />
                        {canChangeRoles && !isCurrentUser && member.role !== 'OWNER' ? (
                          <Select
                            value={member.role}
                            onValueChange={(role) => handleChangeRole(member.userId, role)}
                          >
                            <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs border-0 bg-transparent p-0 pr-5 gap-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-md">
                              <Badge className={`text-[10px] px-2 py-0 font-medium ${roleInfo.color}`}>
                                {language === 'da' ? roleInfo.da : roleInfo.en}
                              </Badge>
                              <ChevronDown className="h-3 w-3 text-[#6b7c75] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-[#1a1f1e] dark:border-white/10">
                              {ROLE_SELECT_OPTIONS.map(role => (
                                <SelectItem key={role} value={role}>
                                  <Badge className={`text-[10px] px-2 py-0 ${getRoleColor(role)}`}>
                                    {getRoleLabel(role, language)}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={`text-[10px] px-2 py-0 font-medium ${roleInfo.color}`}>
                            {language === 'da' ? roleInfo.da : roleInfo.en}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {member.joinedAt && (
                          <span className="text-[10px] text-[#6b7c75] mr-1 hidden sm:inline">
                            {formatDistanceToNow(new Date(member.joinedAt), {
                              addSuffix: true,
                              locale: language === 'da' ? da : undefined,
                            })}
                          </span>
                        )}
                        {canRemoveMembers && !isCurrentUser && member.role !== 'OWNER' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#6b7c75] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRemoveMember(member.userId, displayName)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-amber-500" />
                {language === 'da' ? 'Afventende invitationer' : 'Pending Invitations'}
                <Badge variant="outline" className="text-xs font-normal dark:border-white/10">{invitations.length}</Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {invitations.map(inv => {
                const roleInfo = ROLE_LABELS[inv.role] || ROLE_LABELS.VIEWER;
                const RoleIcon = roleInfo.icon;
                const expiresDate = new Date(inv.expiresAt);
                const createdDate = new Date(inv.createdAt);
                const isExpired = expiresDate < new Date();
                const isExpanded = expandedInviteId === inv.id;
                const avatarColor = getAvatarColor(inv.email);
                const initials = getInitials(null, inv.email);

                return (
                  <div
                    key={inv.id}
                    className={`group relative rounded-xl border p-4 transition-all hover:shadow-md ${
                      isExpired
                        ? 'border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.01] opacity-70'
                        : 'border-amber-200/60 dark:border-amber-500/10 bg-amber-50/30 dark:bg-amber-900/5 hover:border-amber-300 dark:hover:border-amber-500/20'
                    }`}
                  >
                    {/* Top row: avatar + email */}
                    <div className="flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor}`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1a2e2a] dark:text-white truncate">{inv.email}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isExpired ? (
                            <span className="text-[10px] text-red-500 flex items-center gap-1">
                              <X className="h-3 w-3" />
                              {language === 'da' ? 'Udløbet' : 'Expired'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {language === 'da' ? 'Udløber' : 'Expires'} {format(expiresDate, 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom row: role + invited date + expand */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <RoleIcon className="h-3.5 w-3.5 text-[#6b7c75]" />
                        <Badge className={`text-[10px] px-2 py-0 font-medium ${roleInfo.color}`}>
                          {language === 'da' ? roleInfo.da : roleInfo.en}
                        </Badge>
                        <span className="text-[10px] text-[#6b7c75] hidden sm:inline">
                          {language === 'da' ? 'Inviteret' : 'Invited'} {formatDistanceToNow(createdDate, {
                            addSuffix: true,
                            locale: language === 'da' ? da : undefined,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {canInviteMembers && !isExpired && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#6b7c75] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRevokeInvite(inv.id, inv.email)}
                            disabled={revokingId === inv.id}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-[#6b7c75]">
                          <Clock className="h-3 w-3" />
                          <span>
                            {language === 'da' ? 'Oprettet' : 'Created'}:{' '}
                            {format(createdDate, 'PPPp', { locale: language === 'da' ? da : undefined })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#6b7c75]">
                          <Mail className="h-3 w-3" />
                          <span>
                            {language === 'da' ? 'Udløber' : 'Expires'}:{' '}
                            {format(expiresDate, 'PPPp', { locale: language === 'da' ? da : undefined })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#6b7c75]">
                          <Shield className="h-3 w-3" />
                          <span>
                            {language === 'da' ? 'Rolle' : 'Role'}:{' '}
                            {language === 'da' ? roleInfo.da : roleInfo.en}
                          </span>
                        </div>
                        {isExpired && (
                          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-2 mt-2">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {language === 'da'
                                ? 'Denne invitation er udløbet. Du skal sende en ny invitation.'
                                : 'This invitation has expired. You need to send a new invitation.'}
                            </span>
                          </div>
                        )}
                        {!isExpired && canInviteMembers && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800/50 dark:hover:bg-red-900/10 dark:text-red-400 text-xs"
                            onClick={() => {
                              handleRevokeInvite(inv.id, inv.email);
                              setExpandedInviteId(null);
                            }}
                            disabled={revokingId === inv.id}
                          >
                            {revokingId === inv.id
                              ? (language === 'da' ? 'Annullerer...' : 'Revoking...')
                              : (language === 'da' ? 'Annuller invitation' : 'Revoke invitation')}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Click to expand/collapse (mobile-friendly) */}
                    <button
                      className="absolute inset-0 w-full h-full cursor-pointer z-0 rounded-xl"
                      onClick={() => setExpandedInviteId(isExpanded ? null : inv.id)}
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                    />
                    {/* Re-raise interactive elements above the overlay */}
                    <style>{`
                      .group > button[aria-label] + * { position: relative; z-index: 1; }
                      .group > .absolute.inset-0 { pointer-events: auto; }
                      .group > *:not(.absolute) { position: relative; z-index: 1; pointer-events: auto; }
                    `}</style>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
