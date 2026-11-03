export function rememberActiveBusiness(businessId: string): void {
  window.localStorage.setItem("active_business_id", businessId);
  document.cookie = `x-business-id=${businessId}; path=/; max-age=31536000; SameSite=Lax`;
}
