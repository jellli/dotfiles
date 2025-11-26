vim.g.inlay_hint = true

---@diagnostic disable: missing-fields
local ensure_installed = {
  -- "rust-analyzer",

  "cssmodules-language-server",
  "css-lsp",
  -- "tailwindcss-language-server",
  "emmet-ls",
  -- "biome",
  "vtsls",

  "stylua",
  "lua-language-server",
}

---@param client vim.lsp.Client
---@param bufnr integer
local function on_attact(client, bufnr)
  local map = require("utils").map

  -- Disable default keybinds
  pcall(vim.keymap.del, "n", "gra")
  pcall(vim.keymap.del, "n", "gri")
  pcall(vim.keymap.del, "n", "grn")
  pcall(vim.keymap.del, "n", "grr")
  pcall(vim.keymap.del, "n", "grt")

  ---Diagnostic goto
  ---@param direction 'prev'| 'next'
  ---@param severity "ERROR"|"WARN"|"INFO"|"HINT"|nil -- vim.diagnostic.Severity
  ---@return function
  local diagnostic_goto = function(direction, severity)
    return function()
      vim.diagnostic.jump({
        count = direction == "next" and 1 or -1,
        severity = severity and vim.diagnostic.severity[severity] or nil,
      })
    end
  end

  map("]d", diagnostic_goto("next"), { desc = "Next Diagnostic" })
  map("[d", diagnostic_goto("prev"), { desc = "Prev Diagnostic" })
  map("]e", diagnostic_goto("next", "ERROR"), { desc = "Next Error" })
  map("[e", diagnostic_goto("prev", "ERROR"), { desc = "Prev Error" })
  map("]w", diagnostic_goto("next", "WARN"), { desc = "Next Warning" })
  map("[w", diagnostic_goto("prev", "WARN"), { desc = "Prev Warning" })

  if client:supports_method("textDocument/documentColor") then
    vim.lsp.document_color.enable(true, bufnr, {
      style = "virtual",
    })
  end

  local lsp_picker = require("mini-bonus").lsp_picker
  if client:supports_method("textDocument/definition") then
    map("gd", function()
      lsp_picker("definition")
    end, { desc = "Goto Definition" })
  end

  if client:supports_method("textDocument/references") then
    map("gr", function()
      lsp_picker("references")
    end, { desc = "Goto Reference" })
  end

  if client:supports_method("textDocument/typeDefinition") then
    map("gt", function()
      lsp_picker("type_definition")
    end, { desc = "Goto Type Definition" })
  end

  if client:supports_method("textDocument/implementation") then
    map("gI", function()
      lsp_picker("implementation")
    end, { desc = "Goto Implementation" })
  end

  if client:supports_method("textDocument/codeAction") then
    map("<leader>ca", vim.lsp.buf.code_action, { desc = "Code Actions" })
  end

  if client:supports_method("textDocument/rename") then
    map("<leader>rn", vim.lsp.buf.rename, { desc = "Rename" })
  end

  if client:supports_method("textDocument/documentHighlight") then
    local highlight_augroup = vim.api.nvim_create_augroup("j/cursor-highlight", { clear = false })
    vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
      buffer = bufnr,
      group = highlight_augroup,
      callback = vim.lsp.buf.document_highlight,
    })

    vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
      buffer = bufnr,
      group = highlight_augroup,
      callback = vim.lsp.buf.clear_references,
    })
  end

  if client:supports_method("textDocument/inlayHint") then
    -- NOTE: the vim.g may not be set at the very beginning
    vim.defer_fn(function()
      vim.lsp.inlay_hint.enable(vim.g.inlay_hint, { bufnr })
    end, 500)

    -- dont clear because more than one lsp will attach
    local auto_toggle_inlay_hint = vim.api.nvim_create_augroup("auto_toggle_inlay_hint", { clear = false })
    vim.lsp.inlay_hint.enable(true, {
      bufnr,
    })

    vim.api.nvim_create_autocmd("InsertEnter", {
      group = auto_toggle_inlay_hint,
      desc = "Auto disable inlay hint",
      buffer = bufnr,
      callback = function()
        -- disable anyway
        vim.lsp.inlay_hint.enable(false, { bufnr })
      end,
    })

    vim.api.nvim_create_autocmd("InsertLeave", {
      group = auto_toggle_inlay_hint,
      desc = "Auto enable inlay hint",
      buffer = bufnr,
      callback = function()
        if vim.g.inlay_hint then
          vim.lsp.inlay_hint.enable(true, { bufnr })
        end
      end,
    })

    map("<leader>th", function()
      vim.g.inlay_hint = not vim.g.inlay_hint
      vim.lsp.inlay_hint.enable(vim.g.inlay_hint, { bufnr })
    end, { desc = "Toggle Inlay Hints" })
  end
end

vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(event)
    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if not client then
      vim.notify("No client found", vim.log.levels.WARN)
      return
    end
    on_attact(client, event.buf)
  end,
})

local function install_missing_lsp()
  local success, mason_registry = pcall(require, "mason-registry")
  if not success then
    vim.notify("mason-registry not found", vim.log.levels.ERROR)
    return
  end

  local function enable_lsp(p)
    if p.spec.neovim and p.spec.neovim.lspconfig then
      vim.lsp.enable(p.spec.neovim.lspconfig)
      return
    end
    vim.notify("LSP " .. p.name .. " does not have a neovim config, skipping", vim.log.levels.WARN)
  end

  local installed = mason_registry.get_installed_package_names()
  for _, package_name in ipairs(ensure_installed) do
    local p = mason_registry.get_package(package_name)
    if not vim.tbl_contains(installed, package_name) and vim.fn.executable(package_name) ~= 1 then
      p:install():once("install:success", function()
        enable_lsp(p)
      end)
      vim.notify("Installing missing lsp: " .. package_name, vim.log.levels.INFO)
    else
      enable_lsp(p)
    end
  end
end

--- @type LazySpec
return {
  -- {
  --   "neovim/nvim-lspconfig",
  --   event = { "BufReadPre", "BufNewFile" },
  -- },
  {
    "mason-org/mason.nvim",
    -- cmd = { "Mason", "MasonInstall", "MasonUninstall", "MasonUninstallAll", "MasonLog" },
    config = function()
      require("mason").setup()
      install_missing_lsp()
    end,
  },
  {
    "b0o/schemastore.nvim",
    ft = { "json", "yaml" },
  },
  -- {
  --   -- `lazydev` configures Lua LSP for your Neovim config, runtime and plugins
  --   -- used for completion, annotations and signatures of Neovim apis
  --   "folke/lazydev.nvim",
  --   ft = "lua",
  --   opts = {
  --     library = {
  --       { path = "snacks.nvim", words = { "Snacks" } },
  --       { path = "lazy.nvim", words = { "LazyVim" } },
  --       { path = vim.fn.stdpath("data") .. "/LuaAddons/love2d/library" },
  --     },
  --   },
  -- },
  -- {
  --   "Wansmer/symbol-usage.nvim",
  --   event = "LspAttach",
  --   config = true,
  -- },
  -- {
  --   "j-hui/fidget.nvim",
  --   opts = {
  --     -- options
  --   },
  -- },
}
