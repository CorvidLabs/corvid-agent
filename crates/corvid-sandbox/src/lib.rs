//! Corvid Plugin Sandbox
//!
//! Provides secure isolation for untrusted plugins using WASM runtime
//! and capability-based access control.

use corvid_plugin_api::{PluginError, Capability};
use std::collections::HashSet;

/// Configuration for the plugin sandbox
#[derive(Debug, Clone)]
pub struct SandboxConfig {
    /// Maximum memory allocation in bytes
    pub max_memory_bytes: u64,
    /// Maximum execution time in milliseconds
    pub timeout_ms: u64,
    /// Allowed capabilities for this sandbox instance
    pub allowed_capabilities: HashSet<Capability>,
    /// Whether to enable logging
    pub enable_logging: bool,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            max_memory_bytes: 64 * 1024 * 1024, // 64MB
            timeout_ms: 5000, // 5 seconds
            allowed_capabilities: HashSet::new(),
            enable_logging: true,
        }
    }
}

/// Audit entry for capability access tracking
#[derive(Debug, Clone)]
pub struct CapabilityAuditEntry {
    pub capability: Capability,
    pub granted: bool,
    pub timestamp: std::time::SystemTime,
}

/// Capability gate that intercepts and validates capability requests
pub struct CapabilityGate {
    allowed: HashSet<Capability>,
    audit_log: Vec<CapabilityAuditEntry>,
}

impl CapabilityGate {
    pub fn new(allowed_capabilities: HashSet<Capability>) -> Self {
        Self {
            allowed: allowed_capabilities,
            audit_log: Vec::new(),
        }
    }
    
    /// Check if a capability is permitted
    pub fn check(&mut self, cap: &Capability) -> Result<(), PluginError> {
        let granted = self.allowed.contains(cap);
        
        self.audit_log.push(CapabilityAuditEntry {
            capability: cap.clone(),
            granted,
            timestamp: std::time::SystemTime::now(),
        });
        
        if granted {
            Ok(())
        } else {
            Err(PluginError::CapabilityDenied(cap.clone()))
        }
    }
    
    /// Get audit log for security review
    pub fn audit_log(&self) -> &[CapabilityAuditEntry] {
        &self.audit_log
    }
}

/// Builder for creating sandboxed plugin environments
pub struct SandboxBuilder {
    config: SandboxConfig,
}

impl SandboxBuilder {
    pub fn new() -> Self {
        Self {
            config: SandboxConfig::default(),
        }
    }
    
    pub fn with_memory_limit(mut self, bytes: u64) -> Self {
        self.config.max_memory_bytes = bytes;
        self
    }
    
    pub fn with_timeout(mut self, ms: u64) -> Self {
        self.config.timeout_ms = ms;
        self
    }
    
    pub fn with_capabilities(mut self, caps: Vec<Capability>) -> Self {
        self.config.allowed_capabilities = caps.into_iter().collect();
        self
    }
    
    pub fn build(self) -> SandboxConfig {
        self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_capability_gate_denies_unknown() {
        let mut gate = CapabilityGate::new(HashSet::new());
        let result = gate.check(&Capability::FileSystemRead);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_capability_gate_allows_configured() {
        let mut caps = HashSet::new();
        caps.insert(Capability::FileSystemRead);
        let mut gate = CapabilityGate::new(caps);
        let result = gate.check(&Capability::FileSystemRead);
        assert!(result.is_ok());
    }
}
