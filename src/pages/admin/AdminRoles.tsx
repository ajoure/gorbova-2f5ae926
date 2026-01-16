import { useState, useMemo } from "react";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, Plus, Search, LayoutGrid, List } from "lucide-react";
import { RoleBadge } from "@/components/admin/RoleBadge";
import { RemoveRoleDialog } from "@/components/admin/RemoveRoleDialog";
import { AddEmployeeDialog } from "@/components/admin/AddEmployeeDialog";
import { RoleCard } from "@/components/admin/RoleCard";
import { RolePermissionEditor } from "@/components/admin/RolePermissionEditor";
import { RoleTemplateSelector } from "@/components/admin/RoleTemplateSelector";
import { HelpIcon } from "@/components/help/HelpComponents";
import { toast } from "sonner";

// System roles that cannot be deleted
const SYSTEM_ROLES = ["super_admin", "admin", "user", "support", "editor"];

// Role display names
const getRoleDisplayName = (code: string) => {
  const displayNames: Record<string, string> = {
    super_admin: "Владелец",
    admin: "Администратор",
    admin_gost: "Администратор-гость",
    editor: "Редактор",
    support: "Поддержка",
    staff: "Сотрудник",
    user: "Пользователь",
  };
  return displayNames[code] || code;
};

export default function AdminRoles() {
  const { roles, allPermissions, loading, assignRole, removeRole, setRolePermissions, createRole, refetch } = useAdminRoles();
  const { users, refetch: refetchUsers } = useAdminUsers();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const { user: currentUser } = useAuth();

  // View mode for roles tab
  const [rolesViewMode, setRolesViewMode] = useState<"cards" | "table">("cards");

  // Staff search
  const [staffSearch, setStaffSearch] = useState("");

  // New permission editor
  const [editingRoleForEditor, setEditingRoleForEditor] = useState<{
    id: string;
    name: string;
    code: string;
    permissions: string[];
  } | null>(null);

  const [assignDialog, setAssignDialog] = useState<{ open: boolean; userId: string; email: string }>({ open: false, userId: "", email: "" });
  const [selectedRole, setSelectedRole] = useState("");

  const [removeRoleDialog, setRemoveRoleDialog] = useState<{
    open: boolean;
    userId: string;
    email: string;
    roleCode: string;
    roleName: string;
  }>({ open: false, userId: "", email: "", roleCode: "", roleName: "" });

  // Create role with template
  const [createRoleDialog, setCreateRoleDialog] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [newRoleCode, setNewRoleCode] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);

  // Delete role dialog
  const [deleteRoleDialog, setDeleteRoleDialog] = useState<{
    open: boolean;
    roleId: string;
    roleName: string;
    roleCode: string;
  }>({ open: false, roleId: "", roleName: "", roleCode: "" });

  // Add employee dialog
  const [addEmployeeDialogOpen, setAddEmployeeDialogOpen] = useState(false);

  // Get effective role for a user (single role model)
  const getEffectiveRole = (userRoles: { code: string; name: string }[]) => {
    const priority = ["super_admin", "admin", "admin_gost", "editor", "support", "staff"];
    for (const code of priority) {
      const role = userRoles.find(r => r.code === code);
      if (role) return role;
    }
    return null;
  };

  // Count users per role
  const userCountByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => {
      const effectiveRole = getEffectiveRole(u.roles);
      if (effectiveRole) {
        counts[effectiveRole.code] = (counts[effectiveRole.code] || 0) + 1;
      }
    });
    return counts;
  }, [users]);

  // Staff = users with non-user roles
  const staffUsers = useMemo(() => {
    return users.filter((u) => {
      const effectiveRole = getEffectiveRole(u.roles);
      if (effectiveRole === null) return false;

      // Apply search filter
      if (staffSearch) {
        const search = staffSearch.toLowerCase();
        const matchesEmail = u.email?.toLowerCase().includes(search);
        const matchesName = u.full_name?.toLowerCase().includes(search);
        return matchesEmail || matchesName;
      }
      return true;
    });
  }, [users, staffSearch]);

  const handleEditPermissions = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (role) {
      setEditingRoleForEditor({
        id: role.id,
        name: role.name,
        code: role.code,
        permissions: role.permissions.map((p) => p.code),
      });
    }
  };

  const handleSavePermissions = async (permissionCodes: string[]) => {
    if (editingRoleForEditor) {
      await setRolePermissions(editingRoleForEditor.id, permissionCodes);
      setEditingRoleForEditor(null);
    }
  };

  // Inline role change handler with safeguards
  const handleInlineRoleChange = async (userId: string, currentRoleCode: string | undefined, newRoleCode: string) => {
    // UI safeguard: prevent self-role change
    if (userId === currentUser?.id) {
      toast.error("Нельзя изменить свою собственную роль");
      return;
    }

    // UI safeguard: only super_admin can change super_admin roles
    if (currentRoleCode === "super_admin" && !isSuperAdmin()) {
      toast.error("Только Владелец может изменять роль другого Владельца");
      return;
    }

    if (newRoleCode === "user") {
      // Remove role = make user regular user
      if (currentRoleCode) {
        await removeRole(userId, currentRoleCode);
      }
    } else {
      await assignRole(userId, newRoleCode);
    }
    await refetchUsers();
  };

  const handleAssignRole = async () => {
    if (assignDialog.userId && selectedRole) {
      // UI safeguard: prevent self-role change
      if (assignDialog.userId === currentUser?.id) {
        toast.error("Нельзя изменить свою собственную роль");
        setAssignDialog({ open: false, userId: "", email: "" });
        setSelectedRole("");
        return;
      }

      await assignRole(assignDialog.userId, selectedRole);
      await refetchUsers();
      setAssignDialog({ open: false, userId: "", email: "" });
      setSelectedRole("");
    }
  };

  const handleRemoveRoleConfirm = async () => {
    if (removeRoleDialog.userId && removeRoleDialog.roleCode) {
      await removeRole(removeRoleDialog.userId, removeRoleDialog.roleCode);
      await refetchUsers();
      setRemoveRoleDialog({ open: false, userId: "", email: "", roleCode: "", roleName: "" });
    }
  };

  const handleCreateRole = async () => {
    if (newRoleCode && newRoleName) {
      const success = await createRole(newRoleCode, newRoleName, newRoleDescription);
      if (success && newRolePermissions.length > 0) {
        // Find the newly created role and set permissions
        await refetch();
        const newRole = roles.find(r => r.code === newRoleCode);
        if (newRole) {
          await setRolePermissions(newRole.id, newRolePermissions);
        }
      }
      setCreateRoleDialog(false);
      setNewRoleCode("");
      setNewRoleName("");
      setNewRoleDescription("");
      setNewRolePermissions([]);
    }
  };

  const handleTemplateSelect = (permissionCodes: string[]) => {
    setNewRolePermissions(permissionCodes);
    setCreateRoleDialog(true);
  };

  const handleDeleteRole = async () => {
    if (!deleteRoleDialog.roleId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Сессия истекла — войдите снова");
        return;
      }

      const response = await supabase.functions.invoke("roles-admin", {
        body: { action: "delete_role", roleId: deleteRoleDialog.roleId },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.error) {
        toast.error("Ошибка удаления роли");
        return;
      }

      if (response.data?.error) {
        const errorMap: Record<string, string> = {
          "Cannot delete system role": "Нельзя удалить системную роль",
          "Role is assigned to users. Remove role from all users first.": "Роль назначена пользователям. Сначала снимите роль со всех пользователей.",
          "Role not found": "Роль не найдена",
          "Permission denied": "Нет прав для удаления роли",
        };
        toast.error(errorMap[response.data.error] || response.data.error);
        return;
      }

      toast.success("Роль удалена");
      await refetch();
    } catch (error) {
      console.error("Delete role error:", error);
      toast.error("Ошибка удаления роли");
    } finally {
      setDeleteRoleDialog({ open: false, roleId: "", roleName: "", roleCode: "" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Сотрудники и роли</h1>
        <HelpIcon helpKey="roles.admin" alwaysShow />
      </div>

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Сотрудники</TabsTrigger>
          <TabsTrigger value="roles">Роли и права</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-4">
          {/* Staff header with search and invite */}
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или email..."
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {hasPermission("admins.manage") && (
              <Button onClick={() => setAddEmployeeDialogOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Добавить сотрудника
              </Button>
            )}
          </div>

          <GlassCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffUsers.map((user) => {
                  const effectiveRole = getEffectiveRole(user.roles);
                  if (!effectiveRole) return null;

                  const isCurrentUser = user.user_id === currentUser?.id;
                  const canChangeRole = hasPermission("admins.manage") && !isCurrentUser;
                  const canRemove = canChangeRole && (effectiveRole.code !== "super_admin" || isSuperAdmin());

                  return (
                    <TableRow key={user.user_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.full_name || "—"}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canChangeRole ? (
                          <Select
                            value={effectiveRole.code}
                            onValueChange={(newRole) => handleInlineRoleChange(user.user_id, effectiveRole.code, newRole)}
                            disabled={isCurrentUser}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roles
                                .filter(r => r.code !== "super_admin" || isSuperAdmin())
                                .map(role => (
                                  <SelectItem key={role.code} value={role.code}>
                                    {getRoleDisplayName(role.code)}
                                  </SelectItem>
                                ))}
                              <SelectItem value="user">Пользователь (снять роль)</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <RoleBadge
                            role={effectiveRole}
                            canRemove={canRemove}
                            onRemove={canRemove ? () => setRemoveRoleDialog({
                              open: true,
                              userId: user.user_id,
                              email: user.email || "",
                              roleCode: effectiveRole.code,
                              roleName: effectiveRole.name
                            }) : undefined}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {canChangeRole && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAssignDialog({ open: true, userId: user.user_id, email: user.email || "" })}
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {staffUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      {staffSearch ? "Сотрудники не найдены" : "Нет сотрудников с административными ролями"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </GlassCard>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          {/* Header with view toggle and create button */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant={rolesViewMode === "cards" ? "default" : "outline"}
                size="sm"
                onClick={() => setRolesViewMode("cards")}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={rolesViewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setRolesViewMode("table")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
            {hasPermission("roles.manage") && (
              <Button onClick={() => setTemplateSelectorOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Создать роль
              </Button>
            )}
          </div>

          {/* Cards view */}
          {rolesViewMode === "cards" && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => {
                const isSystemRole = SYSTEM_ROLES.includes(role.code);
                const canEdit = hasPermission("roles.manage") && (role.code !== "super_admin" || isSuperAdmin());
                const canDelete = hasPermission("roles.manage") && !isSystemRole;

                return (
                  <RoleCard
                    key={role.id}
                    role={role}
                    userCount={userCountByRole[role.code] || 0}
                    isSystemRole={isSystemRole}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={() => handleEditPermissions(role.id)}
                    onDelete={() => setDeleteRoleDialog({
                      open: true,
                      roleId: role.id,
                      roleName: role.name,
                      roleCode: role.code
                    })}
                  />
                );
              })}
            </div>
          )}

          {/* Table view */}
          {rolesViewMode === "table" && (
            <GlassCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Роль</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead>Права</TableHead>
                    <TableHead>Пользователи</TableHead>
                    <TableHead className="w-[150px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => {
                    const isSystemRole = SYSTEM_ROLES.includes(role.code);
                    const canEdit = hasPermission("roles.manage") && (role.code !== "super_admin" || isSuperAdmin());
                    const canDelete = hasPermission("roles.manage") && !isSystemRole;

                    return (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="font-medium">{getRoleDisplayName(role.code)}</div>
                          {isSystemRole && (
                            <Badge variant="outline" className="text-xs mt-1">Системная</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {role.description || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{role.permissions.length} прав</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{userCountByRole[role.code] || 0}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {canEdit && (
                              <Button size="sm" variant="ghost" onClick={() => handleEditPermissions(role.id)}>
                                Изменить
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteRoleDialog({
                                  open: true,
                                  roleId: role.id,
                                  roleName: role.name,
                                  roleCode: role.code
                                })}
                              >
                                Удалить
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </GlassCard>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Employee Dialog */}
      <AddEmployeeDialog
        open={addEmployeeDialogOpen}
        onOpenChange={setAddEmployeeDialogOpen}
        roles={roles}
        onSuccess={() => refetchUsers()}
        currentUserId={currentUser?.id}
        isSuperAdmin={isSuperAdmin()}
      />

      {/* New Role Permission Editor */}
      {editingRoleForEditor && (
        <RolePermissionEditor
          open={true}
          onOpenChange={() => setEditingRoleForEditor(null)}
          roleName={editingRoleForEditor.name}
          roleCode={editingRoleForEditor.code}
          allPermissions={allPermissions}
          selectedPermissions={editingRoleForEditor.permissions}
          onSave={handleSavePermissions}
        />
      )}

      {/* Template Selector */}
      <RoleTemplateSelector
        open={templateSelectorOpen}
        onOpenChange={setTemplateSelectorOpen}
        allPermissions={allPermissions}
        onSelectTemplate={handleTemplateSelect}
      />

      {/* Assign Role Dialog */}
      <Dialog open={assignDialog.open} onOpenChange={(open) => setAssignDialog({ ...assignDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Назначить роль</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Сотрудник: {assignDialog.email}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Текущая роль будет заменена на новую.
          </p>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите роль" />
            </SelectTrigger>
            <SelectContent>
              {roles
                .filter((r) => r.code !== "user" && (r.code !== "super_admin" || isSuperAdmin()))
                .map((role) => (
                  <SelectItem key={role.code} value={role.code}>
                    {getRoleDisplayName(role.code)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog({ open: false, userId: "", email: "" })}>Отмена</Button>
            <Button onClick={handleAssignRole} disabled={!selectedRole}>Назначить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Role Dialog */}
      <RemoveRoleDialog
        open={removeRoleDialog.open}
        onOpenChange={(open) => setRemoveRoleDialog({ ...removeRoleDialog, open })}
        onConfirm={handleRemoveRoleConfirm}
        roleName={removeRoleDialog.roleName}
        userEmail={removeRoleDialog.email}
      />

      {/* Delete Role Confirm Dialog */}
      <AlertDialog open={deleteRoleDialog.open} onOpenChange={(open) => setDeleteRoleDialog({ ...deleteRoleDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить роль?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить роль "{deleteRoleDialog.roleName}"?
              Это действие нельзя отменить. Все связанные права будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Role Dialog */}
      <Dialog open={createRoleDialog} onOpenChange={setCreateRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать новую роль</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-code">Код роли</Label>
              <Input
                id="role-code"
                placeholder="например: moderator"
                value={newRoleCode}
                onChange={(e) => setNewRoleCode(e.target.value.toLowerCase().replace(/\s/g, "_"))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-name">Название</Label>
              <Input
                id="role-name"
                placeholder="например: Модератор"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-description">Описание (опционально)</Label>
              <Input
                id="role-description"
                placeholder="Описание роли"
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
              />
            </div>
            {newRolePermissions.length > 0 && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm font-medium mb-1">Выбранные права из шаблона:</p>
                <p className="text-sm text-muted-foreground">
                  {newRolePermissions.length} прав будет добавлено после создания роли
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateRoleDialog(false);
              setNewRolePermissions([]);
            }}>Отмена</Button>
            <Button onClick={handleCreateRole} disabled={!newRoleCode || !newRoleName}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
