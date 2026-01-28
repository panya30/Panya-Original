/**
 * Panya Adapters
 *
 * Adapters for different integration points:
 * - MCP: Model Context Protocol for Claude Code
 * - HTTP: REST API for universal access
 * - CLI: (future) Command-line interface
 */

export { PanyaMCPAdapter, createPanyaMCPAdapter, PANYA_MCP_TOOLS, type MCPTool, type MCPToolCall, type MCPToolResult } from './mcp';
export { PanyaHTTPAdapter, createPanyaHTTPServer, type HTTPServerConfig, type HTTPResponse } from './http';
