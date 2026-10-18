"use client";

import { useActionState, useState } from "react";

import {
  addRoleAssignment,
  createRole,
  createStaff,
  removeRoleAssignment,
  resetStaffPin,
  toggleRoleStatus,
  toggleStaffStatus,
  updateRole,
  updateStaffProfile,
  type StaffActionState,
} from "@/app/settings/staff/actions";
import { permissionCatalog, roleTemplates, type PermissionKey } from "@/lib/permissions";

type BranchOption = {
  id: string;
  name: string;
  code: string;
};

type RoleOption = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  assignmentCount: number;
};

type StaffAssignment = {
  id: string;
  roleId: string;
  roleName: string;
  roleIsSystem: boolean;
  branchId: string | null;
  branchName: string | null;
};

type StaffMember = {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
  mustChangePin: boolean;
  assignments: StaffAssignment[];
};

type StaffManagementProps = {
  organizationName: string;
  currentUserId: string;
  branches: BranchOption[];
  roles: RoleOption[];
  staff: StaffMember[];
};

const initialState: StaffActionState = {};

function Feedback({ state }: { state: StaffActionState }) {
  return (
    <div aria-live="polite" className="staff-feedback">
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
    </div>
  );
}

function ScopeFields({
  branches,
  idPrefix,
  containsOrganizationPermissions = false,
}: {
  branches: BranchOption[];
  idPrefix: string;
  containsOrganizationPermissions?: boolean;
}) {
  const [scope, setScope] = useState<"organization" | "branch">(
    branches.length && !containsOrganizationPermissions ? "branch" : "organization",
  );

  return (
    <fieldset className="staff-fieldset staff-scope-fieldset">
      <legend>ขอบเขตการทำงาน</legend>
      <div className="staff-radio-grid">
        <label htmlFor={`${idPrefix}-scope-branch`}>
          <input
            checked={scope === "branch"}
            disabled={!branches.length}
            id={`${idPrefix}-scope-branch`}
            name="scope"
            onChange={() => setScope("branch")}
            type="radio"
            value="branch"
          />
          <span><strong>เฉพาะสาขา</strong><small>ใช้สิทธิ์กับสาขาที่เลือกเท่านั้น</small></span>
        </label>
        <label htmlFor={`${idPrefix}-scope-organization`}>
          <input
            checked={scope === "organization"}
            id={`${idPrefix}-scope-organization`}
            name="scope"
            onChange={() => setScope("organization")}
            type="radio"
            value="organization"
          />
          <span><strong>ทุกสาขา</strong><small>รวมข้อมูลกลางของทั้งร้าน</small></span>
        </label>
      </div>
      {scope === "branch" ? (
        <label className="staff-select-label" htmlFor={`${idPrefix}-branch`}>
          <span>สาขา</span>
          <select defaultValue={branches[0]?.id} id={`${idPrefix}-branch`} name="branchId" required>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>
            ))}
          </select>
        </label>
      ) : (
        <input name="branchId" type="hidden" value="" />
      )}
      {containsOrganizationPermissions ? <small className="staff-scope-note">หากเลือกเฉพาะสาขา สิทธิ์ข้อมูลกลางในบทบาทนี้จะไม่มีผลกับพนักงาน</small> : null}
    </fieldset>
  );
}

function roleContainsOrganizationPermissions(role: RoleOption | undefined) {
  if (!role) return false;
  return role.permissions.some((key) =>
    permissionCatalog.some((permission) => permission.key === key && permission.scope === "organization"),
  );
}

function PermissionFields({
  idPrefix,
  selected,
  onChange,
}: {
  idPrefix: string;
  selected: readonly string[];
  onChange: (permissions: PermissionKey[]) => void;
}) {
  const toggle = (permission: PermissionKey, checked: boolean) => {
    const next = checked
      ? [...new Set([...selected, permission])]
      : selected.filter((value) => value !== permission);
    onChange(next as PermissionKey[]);
  };

  return (
    <div className="staff-permission-groups">
      {(["organization", "branch"] as const).map((scope) => {
        const options = permissionCatalog.filter((permission) => permission.scope === scope);
        return (
          <fieldset className="staff-fieldset staff-permission-fieldset" key={scope}>
            <legend>{scope === "organization" ? "สิทธิ์ข้อมูลกลางของร้าน" : "สิทธิ์ภายในสาขา"}</legend>
            <div className="staff-permission-grid">
              {options.map((permission) => {
                const inputId = `${idPrefix}-${permission.key.replaceAll(".", "-")}`;
                return (
                  <label className="staff-permission-option" htmlFor={inputId} key={permission.key}>
                    <input
                      checked={selected.includes(permission.key)}
                      id={inputId}
                      name="permissions"
                      onChange={(event) => toggle(permission.key, event.target.checked)}
                      type="checkbox"
                      value={permission.key}
                    />
                    <span><strong>{permission.label}</strong><small>{permission.description}</small></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function CreateStaffForm({ branches, roles }: { branches: BranchOption[]; roles: RoleOption[] }) {
  const [state, action, pending] = useActionState(createStaff, initialState);
  const activeRoles = roles.filter((role) => role.isActive && !role.isSystem);
  const [roleId, setRoleId] = useState(activeRoles[0]?.id ?? "");
  const selectedRole = activeRoles.find((role) => role.id === roleId) ?? activeRoles[0];

  return (
    <form action={action} className="staff-form">
      <div className="staff-field-grid">
        <label htmlFor="new-staff-name"><span>ชื่อพนักงาน</span><input autoComplete="name" id="new-staff-name" maxLength={100} name="displayName" placeholder="เช่น สมชาย ใจดี" required /></label>
        <label htmlFor="new-staff-email"><span>อีเมลเข้าสู่ระบบ</span><input autoComplete="email" id="new-staff-email" maxLength={180} name="email" placeholder="staff@example.com" required type="email" /></label>
      </div>
      <div className="staff-field-grid">
        <label htmlFor="new-staff-pin"><span>PIN เริ่มต้น 6 หลัก</span><input autoComplete="new-password" id="new-staff-pin" inputMode="numeric" maxLength={6} name="pin" pattern="[0-9]{6}" required type="password" /></label>
        <label htmlFor="new-staff-pin-confirmation"><span>ยืนยัน PIN</span><input autoComplete="new-password" id="new-staff-pin-confirmation" inputMode="numeric" maxLength={6} name="pinConfirmation" pattern="[0-9]{6}" required type="password" /></label>
      </div>
      <label htmlFor="new-staff-role"><span>บทบาทแรก</span><select disabled={!activeRoles.length} id="new-staff-role" name="roleId" onChange={(event) => setRoleId(event.target.value)} required value={selectedRole?.id ?? ""}>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      <ScopeFields branches={branches} containsOrganizationPermissions={roleContainsOrganizationPermissions(selectedRole)} idPrefix="new-staff" key={selectedRole?.id ?? "no-role"} />
      {!activeRoles.length ? <p className="staff-inline-note">เพิ่มหรือเปิดใช้งานบทบาทก่อนสร้างบัญชีพนักงาน</p> : null}
      <Feedback state={state} />
      <button className="primary-button" disabled={pending || !activeRoles.length} type="submit">{pending ? "กำลังเพิ่มพนักงาน…" : "เพิ่มพนักงาน"}</button>
    </form>
  );
}

function ProfileForm({ member }: { member: StaffMember }) {
  const [state, action, pending] = useActionState(updateStaffProfile, initialState);
  const idPrefix = `staff-profile-${member.id}`;

  return (
    <form action={action} className="staff-form staff-detail-form">
      <input name="userId" type="hidden" value={member.id} />
      <div className="staff-field-grid">
        <label htmlFor={`${idPrefix}-name`}><span>ชื่อพนักงาน</span><input defaultValue={member.displayName} id={`${idPrefix}-name`} maxLength={100} name="displayName" required /></label>
        <label htmlFor={`${idPrefix}-email`}><span>อีเมล</span><input autoComplete="email" defaultValue={member.email} id={`${idPrefix}-email`} maxLength={180} name="email" required type="email" /></label>
      </div>
      <Feedback state={state} />
      <button className="primary-button" disabled={pending} type="submit">{pending ? "กำลังบันทึก…" : "บันทึกข้อมูล"}</button>
    </form>
  );
}

function AssignmentRemoveForm({ memberId, assignment }: { memberId: string; assignment: StaffAssignment }) {
  const [state, action, pending] = useActionState(removeRoleAssignment, initialState);

  return (
    <form action={action} className="staff-assignment-row">
      <input name="userId" type="hidden" value={memberId} />
      <input name="assignmentId" type="hidden" value={assignment.id} />
      <div>
        <strong>{assignment.roleName}</strong>
        <small>{assignment.branchName ?? "ทุกสาขา"}{assignment.roleIsSystem ? " · บทบาทระบบ" : ""}</small>
      </div>
      <button className="danger-button" disabled={pending} type="submit">{pending ? "กำลังนำออก…" : "นำออก"}</button>
      <Feedback state={state} />
    </form>
  );
}

function AddAssignmentForm({
  branches,
  assignments,
  memberId,
  roles,
}: {
  branches: BranchOption[];
  assignments: StaffAssignment[];
  memberId: string;
  roles: RoleOption[];
}) {
  const [state, action, pending] = useActionState(addRoleAssignment, initialState);
  const activeRoles = roles.filter((role) => role.isActive && !role.isSystem);
  const [roleId, setRoleId] = useState(activeRoles[0]?.id ?? "");
  const selectedRole = activeRoles.find((role) => role.id === roleId) ?? activeRoles[0];
  const hasGlobalAssignment = assignments.some((assignment) => assignment.roleId === selectedRole?.id && assignment.branchId === null);

  return (
    <form action={action} className="staff-form staff-assignment-add">
      <input name="userId" type="hidden" value={memberId} />
      <label htmlFor={`assignment-role-${memberId}`}><span>เพิ่มบทบาท</span><select disabled={!activeRoles.length} id={`assignment-role-${memberId}`} name="roleId" onChange={(event) => setRoleId(event.target.value)} required value={selectedRole?.id ?? ""}>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      <ScopeFields branches={branches} containsOrganizationPermissions={roleContainsOrganizationPermissions(selectedRole)} idPrefix={`assignment-${memberId}`} key={selectedRole?.id ?? "no-role"} />
      {hasGlobalAssignment ? <small className="staff-scope-note">บทบาทนี้มีสิทธิ์ทุกสาขาอยู่แล้ว หากเลือกเฉพาะสาขา ระบบจะเปลี่ยนขอบเขตเดิมให้เหลือสาขาที่เลือก</small> : null}
      <Feedback state={state} />
      <button className="secondary-button" disabled={pending || !activeRoles.length} type="submit">{pending ? "กำลังบันทึก…" : hasGlobalAssignment ? "บันทึกขอบเขตบทบาท" : "เพิ่มสิทธิ์ให้พนักงาน"}</button>
    </form>
  );
}

function ResetPinForm({ member, protectedAccount }: { member: StaffMember; protectedAccount: boolean }) {
  const [state, action, pending] = useActionState(resetStaffPin, initialState);
  const idPrefix = `staff-pin-${member.id}`;

  return (
    <form action={action} className="staff-form staff-detail-form">
      <input name="userId" type="hidden" value={member.id} />
      {protectedAccount ? <p className="staff-inline-note">บัญชีของคุณและบัญชีเจ้าของต้องเปลี่ยน PIN ด้วยตนเองจากเมนูชื่อผู้ใช้</p> : null}
      <p className="staff-inline-note">เมื่อบันทึก ระบบจะให้ออกจากทุกอุปกรณ์ และต้องใช้ PIN ใหม่นี้ในการเข้าสู่ระบบครั้งถัดไป</p>
      <div className="staff-field-grid">
        <label htmlFor={`${idPrefix}-new`}><span>PIN ใหม่ 6 หลัก</span><input autoComplete="new-password" disabled={protectedAccount} id={`${idPrefix}-new`} inputMode="numeric" maxLength={6} name="pin" pattern="[0-9]{6}" required type="password" /></label>
        <label htmlFor={`${idPrefix}-confirmation`}><span>ยืนยัน PIN ใหม่</span><input autoComplete="new-password" disabled={protectedAccount} id={`${idPrefix}-confirmation`} inputMode="numeric" maxLength={6} name="pinConfirmation" pattern="[0-9]{6}" required type="password" /></label>
      </div>
      <Feedback state={state} />
      <button className="secondary-button" disabled={pending || protectedAccount} type="submit">{pending ? "กำลังรีเซ็ต…" : "รีเซ็ต PIN และออกจากระบบทุกเครื่อง"}</button>
    </form>
  );
}

function StaffStatusForm({ member, protectedAccount }: { member: StaffMember; protectedAccount: boolean }) {
  const [state, action, pending] = useActionState(toggleStaffStatus, initialState);

  return (
    <form action={action} className="staff-form staff-status-form">
      <input name="userId" type="hidden" value={member.id} />
      <input name="activate" type="hidden" value={String(!member.isActive)} />
      {protectedAccount ? (
        <p className="staff-inline-note">บัญชีที่กำลังใช้งานและบัญชีเจ้าของระบบไม่สามารถปิดจากหน้านี้ได้</p>
      ) : member.isActive ? (
        <p className="staff-inline-note">พนักงานจะเข้าสู่ระบบไม่ได้และ session ทุกเครื่องจะสิ้นสุด ประวัติรายการเดิมยังอยู่ครบ</p>
      ) : (
        <p className="staff-inline-note">เปิดบัญชีนี้เพื่อให้พนักงานกลับมาเข้าสู่ระบบและใช้สิทธิ์เดิมได้</p>
      )}
      <Feedback state={state} />
      <button className={member.isActive ? "danger-button" : "secondary-button"} disabled={pending || protectedAccount} type="submit">
        {pending ? "กำลังบันทึก…" : member.isActive ? "ปิดใช้งานบัญชี" : "เปิดใช้งานบัญชีอีกครั้ง"}
      </button>
    </form>
  );
}

function StaffCard({
  branches,
  currentUserId,
  member,
  roles,
}: {
  branches: BranchOption[];
  currentUserId: string;
  member: StaffMember;
  roles: RoleOption[];
}) {
  const isCurrentUser = member.id === currentUserId;
  const isSystemOwner = member.assignments.some((assignment) => assignment.roleIsSystem);
  const protectedAccount = isCurrentUser || isSystemOwner;

  return (
    <article className={`staff-card ${member.isActive ? "is-active" : "is-inactive"}`}>
      <header className="staff-card-header">
        <div className="staff-avatar" aria-hidden="true">{member.displayName.trim().charAt(0).toUpperCase() || "P"}</div>
        <div className="staff-card-identity">
          <div className="staff-title-line"><h3>{member.displayName}</h3>{isCurrentUser ? <span className="staff-you-badge">คุณ</span> : null}</div>
          <p>{member.email}</p>
        </div>
        <div className="staff-card-statuses">
          <span className={`staff-status-badge ${member.isActive ? "active" : "inactive"}`}>{member.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
          {member.mustChangePin ? <span className="staff-status-badge attention">รอเปลี่ยน PIN</span> : null}
        </div>
      </header>

      <div className="staff-assignment-chips" aria-label={`บทบาทของ ${member.displayName}`}>
        {member.assignments.length ? member.assignments.map((assignment) => (
          <span key={assignment.id}>{assignment.roleName}<small>{assignment.branchName ?? "ทุกสาขา"}</small></span>
        )) : <span className="staff-empty-chip">ยังไม่มีบทบาท</span>}
      </div>

      <div className="staff-card-details">
        <details>
          <summary>แก้ไขข้อมูล</summary>
          <ProfileForm member={member} />
        </details>
        <details>
          <summary>บทบาทและสาขา <span>{member.assignments.length}</span></summary>
          {isSystemOwner ? (
            <p className="staff-inline-note">บทบาทเจ้าของระบบถูกล็อกเพื่อป้องกันร้านสูญเสียบัญชีผู้ดูแล</p>
          ) : (
            <>
              <div className="staff-assignment-list">
                {member.assignments.length ? member.assignments.map((assignment) => (
                  <AssignmentRemoveForm assignment={assignment} key={assignment.id} memberId={member.id} />
                )) : <p className="staff-inline-note">บัญชีนี้ยังไม่มีสิทธิ์ใช้งานส่วนใดของระบบ</p>}
              </div>
              <AddAssignmentForm assignments={member.assignments} branches={branches} memberId={member.id} roles={roles} />
            </>
          )}
        </details>
        <details>
          <summary>รีเซ็ต PIN</summary>
          <ResetPinForm member={member} protectedAccount={protectedAccount} />
        </details>
        <details>
          <summary>สถานะบัญชี</summary>
          <StaffStatusForm member={member} protectedAccount={protectedAccount} />
        </details>
      </div>
    </article>
  );
}

function CreateRoleForm() {
  const [state, action, pending] = useActionState(createRole, initialState);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);

  const applyTemplate = (templateName: string) => {
    const template = roleTemplates.find((item) => item.name === templateName);
    if (!template) return;
    setName(template.name);
    setPermissions([...template.permissions]);
  };

  return (
    <form action={action} className="staff-form">
      <label htmlFor="role-template"><span>เริ่มจากแม่แบบ (ไม่บังคับ)</span><select defaultValue="" id="role-template" onChange={(event) => applyTemplate(event.target.value)}><option value="">กำหนดเอง</option>{roleTemplates.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}</select></label>
      <label htmlFor="new-role-name"><span>ชื่อบทบาท</span><input id="new-role-name" maxLength={60} name="name" onChange={(event) => setName(event.target.value)} placeholder="เช่น ผู้จัดการกะเย็น" required value={name} /></label>
      <label htmlFor="new-role-description"><span>คำอธิบาย</span><textarea id="new-role-description" maxLength={240} name="description" onChange={(event) => setDescription(event.target.value)} placeholder="อธิบายหน้าที่ของตำแหน่งนี้" rows={3} value={description} /></label>
      <PermissionFields idPrefix="new-role" onChange={setPermissions} selected={permissions} />
      <Feedback state={state} />
      <button className="primary-button" disabled={pending || !permissions.length} type="submit">{pending ? "กำลังสร้างบทบาท…" : "สร้างบทบาท"}</button>
    </form>
  );
}

function RoleEditor({ role }: { role: RoleOption }) {
  const [state, action, pending] = useActionState(updateRole, initialState);
  const [permissions, setPermissions] = useState<PermissionKey[]>(
    role.permissions.filter((value): value is PermissionKey => permissionCatalog.some((permission) => permission.key === value)),
  );

  return (
    <form action={action} className="staff-form staff-role-edit-form">
      <input name="roleId" type="hidden" value={role.id} />
      <div className="staff-field-grid">
        <label htmlFor={`role-name-${role.id}`}><span>ชื่อบทบาท</span><input defaultValue={role.name} id={`role-name-${role.id}`} maxLength={60} name="name" required /></label>
        <label htmlFor={`role-description-${role.id}`}><span>คำอธิบาย</span><input defaultValue={role.description ?? ""} id={`role-description-${role.id}`} maxLength={240} name="description" /></label>
      </div>
      <PermissionFields idPrefix={`role-${role.id}`} onChange={setPermissions} selected={permissions} />
      <Feedback state={state} />
      <button className="primary-button" disabled={pending || !permissions.length} type="submit">{pending ? "กำลังบันทึก…" : "บันทึกบทบาท"}</button>
    </form>
  );
}

function RoleStatusForm({ role }: { role: RoleOption }) {
  const [state, action, pending] = useActionState(toggleRoleStatus, initialState);

  return (
    <form action={action} className="staff-form staff-status-form">
      <input name="roleId" type="hidden" value={role.id} />
      <input name="activate" type="hidden" value={String(!role.isActive)} />
      <p className="staff-inline-note">
        {role.isActive
          ? role.assignmentCount
            ? `มีการมอบหมาย ${role.assignmentCount} รายการ หากยังมีพนักงานที่เปิดใช้งาน ระบบจะแจ้งให้ย้ายบทบาทก่อน`
            : "บทบาทที่ปิดแล้วจะไม่แสดงในฟอร์มมอบหมายสิทธิ์"
          : "เปิดบทบาทนี้เพื่อให้เลือกมอบหมายแก่พนักงานได้อีกครั้ง"}
      </p>
      <Feedback state={state} />
      <button className={role.isActive ? "danger-button" : "secondary-button"} disabled={pending} type="submit">
        {pending ? "กำลังบันทึก…" : role.isActive ? "ปิดใช้งานบทบาท" : "เปิดใช้งานบทบาทอีกครั้ง"}
      </button>
    </form>
  );
}

function RoleCard({ role }: { role: RoleOption }) {
  const permissionNames = permissionCatalog.filter((permission) => role.permissions.includes(permission.key));

  return (
    <article className={`staff-role-card ${role.isActive ? "is-active" : "is-inactive"}`}>
      <header>
        <div><div className="staff-title-line"><h3>{role.name}</h3>{role.isSystem ? <span className="staff-system-badge">บทบาทระบบ</span> : null}</div><p>{role.description || "ไม่มีคำอธิบาย"}</p></div>
        <span className={`staff-status-badge ${role.isActive ? "active" : "inactive"}`}>{role.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
      </header>
      <div className="staff-role-meta"><span>{role.assignmentCount} การมอบหมาย</span><span>{permissionNames.length} สิทธิ์</span></div>
      <div className="staff-permission-chips" aria-label={`สิทธิ์ของบทบาท ${role.name}`}>
        {permissionNames.length ? permissionNames.map((permission) => <span key={permission.key}>{permission.label}</span>) : <span className="staff-empty-chip">ยังไม่มีสิทธิ์</span>}
      </div>
      {role.isSystem ? (
        <p className="staff-system-note">บทบาทระบบถูกล็อกเพื่อรักษาสิทธิ์เจ้าของร้าน</p>
      ) : (
        <div className="staff-card-details">
          <details><summary>แก้ไขบทบาท</summary><RoleEditor role={role} /></details>
          <details><summary>สถานะบทบาท</summary><RoleStatusForm role={role} /></details>
        </div>
      )}
    </article>
  );
}

export function StaffManagement({
  organizationName,
  currentUserId,
  branches,
  roles,
  staff,
}: StaffManagementProps) {
  const activeStaffCount = staff.filter((member) => member.isActive).length;
  const inactiveStaffCount = staff.length - activeStaffCount;
  const activeRoleCount = roles.filter((role) => role.isActive).length;

  return (
    <div className="staff-management">
      <section aria-label="ภาพรวมพนักงาน" className="staff-metrics">
        <article><span>พนักงานที่เปิดใช้</span><strong>{activeStaffCount}</strong><small>เข้าสู่ระบบและทำงานได้</small></article>
        <article><span>บัญชีที่ปิดไว้</span><strong>{inactiveStaffCount}</strong><small>ประวัติรายการยังอยู่ครบ</small></article>
        <article><span>บทบาทที่พร้อมใช้</span><strong>{activeRoleCount}</strong><small>กำหนดแยกทุกสาขาหรือรายสาขาได้</small></article>
      </section>

      <section aria-labelledby="staff-list-heading" className="staff-section">
        <div className="staff-section-heading"><div><p className="eyebrow">Accounts</p><h2 id="staff-list-heading">บัญชีพนักงาน</h2></div><p>แก้ข้อมูล รีเซ็ต PIN และควบคุมสิทธิ์ของทีม {organizationName} ได้จากการ์ดเดียว</p></div>
        <div className="staff-admin-layout">
          <div className="staff-panel">
            {staff.length ? <div className="staff-list">{staff.map((member) => <StaffCard branches={branches} currentUserId={currentUserId} key={member.id} member={member} roles={roles} />)}</div> : <p className="empty-state">ยังไม่มีพนักงาน เพิ่มบัญชีแรกจากฟอร์มด้านขวา</p>}
          </div>
          <aside className="staff-create-card">
            <p className="eyebrow">เพิ่มพนักงาน</p>
            <h2>สร้างบัญชีใหม่</h2>
            <p>พนักงานใช้อีเมลและ PIN 6 หลักเข้าสู่ระบบ จากนั้นจึงเปลี่ยน PIN ของตัวเองได้</p>
            <CreateStaffForm branches={branches} roles={roles} />
          </aside>
        </div>
      </section>

      <section aria-labelledby="role-list-heading" className="staff-section">
        <div className="staff-section-heading"><div><p className="eyebrow">Roles & Permissions</p><h2 id="role-list-heading">บทบาทและสิทธิ์</h2></div><p>สร้างบทบาทตามตำแหน่งงาน แล้วนำไปมอบหมายแบบทุกสาขาหรือเฉพาะสาขา</p></div>
        <div className="staff-role-layout">
          <div className="staff-role-grid">
            {roles.length ? roles.map((role) => <RoleCard key={role.id} role={role} />) : <p className="empty-state">ยังไม่มีบทบาท สร้างบทบาทแรกจากฟอร์มด้านขวา</p>}
          </div>
          <aside className="staff-create-card staff-role-create-card">
            <p className="eyebrow">เพิ่มบทบาท</p>
            <h2>กำหนดสิทธิ์การทำงาน</h2>
            <p>เลือกแม่แบบเพื่อเริ่มเร็วขึ้น แล้วปรับสิทธิ์ให้เหมาะกับขั้นตอนของร้านได้</p>
            <CreateRoleForm />
          </aside>
        </div>
      </section>
    </div>
  );
}
