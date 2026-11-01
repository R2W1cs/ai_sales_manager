import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  ownerAc,
  memberAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  billing: ["manage", "read"],
  business: ["write", "delete", "read"],
  members: ["manage", "read"],
  integrations: ["manage", "read"],
  catalog: ["write", "read"],
  rules: ["write", "read"],
  knowledge: ["write", "read"],
  ai: ["configure", "playground", "traces.read", "read"],
  flags: ["write", "read"],
  customers: ["merge", "export", "erase", "write", "read"],
  audit: ["read"],
  analytics: ["read"],
  inbox: ["read", "write"],
  orders: ["write", "read"],
  usage: ["read"],
} as const;

export const ac = createAccessControl(statement);

export const ownerRole = ac.newRole({
  ...ownerAc.statements,
  billing: ["manage", "read"],
  business: ["write", "delete", "read"],
  members: ["manage", "read"],
  integrations: ["manage", "read"],
  catalog: ["write", "read"],
  rules: ["write", "read"],
  knowledge: ["write", "read"],
  ai: ["configure", "playground", "traces.read", "read"],
  flags: ["write", "read"],
  customers: ["merge", "export", "erase", "write", "read"],
  audit: ["read"],
  analytics: ["read"],
  inbox: ["read", "write"],
  orders: ["write", "read"],
  usage: ["read"],
});

export const adminRole = ac.newRole({
  ...adminAc.statements,
  business: ["write", "read"],
  members: ["manage", "read"],
  integrations: ["manage", "read"],
  catalog: ["write", "read"],
  rules: ["write", "read"],
  knowledge: ["write", "read"],
  ai: ["configure", "playground", "traces.read", "read"],
  flags: ["write", "read"],
  customers: ["merge", "export", "erase", "write", "read"],
  audit: ["read"],
  analytics: ["read"],
  inbox: ["read", "write"],
  orders: ["write", "read"],
});

export const employeeRole = ac.newRole({
  ...memberAc.statements,
  analytics: ["read"],
  inbox: ["read", "write"],
  orders: ["write", "read"],
  customers: ["write", "read"],
});
