---@type vim.lsp.Config
return {
  cmd = { "cssmodules-language-server" },
  filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
  root_markers = { "package.json" },
}
