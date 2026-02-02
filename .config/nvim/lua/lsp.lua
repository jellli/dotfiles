vim.g.inlay_hint = true
local icons = require("icons")

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

  local lsp_picker = require("picker.lsp").lsp_picker
  if client:supports_method("textDocument/definition") then
    map("gd", function()
      lsp_picker("definition")
    end, { desc = "Goto Definition" })
  end

  if client:supports_method("textDocument/declaration") then
    map("gD", function()
      lsp_picker("declaration")
    end, { desc = "Goto Declaration" })
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
        if vim.lsp.inlay_hint.is_enabled() then
          vim.lsp.inlay_hint.enable(false, { bufnr })
        end
      end,
    })

    vim.api.nvim_create_autocmd("InsertLeave", {
      group = auto_toggle_inlay_hint,
      desc = "Auto enable inlay hint",
      buffer = bufnr,
      callback = function()
        if vim.g.inlay_hint and not vim.lsp.inlay_hint.is_enabled() then
          vim.lsp.inlay_hint.enable(true, { bufnr })
        end
      end,
    })

    map("<leader>th", function()
      vim.g.inlay_hint = not vim.g.inlay_hint
      vim.lsp.inlay_hint.enable(vim.g.inlay_hint, { bufnr })
    end, { desc = "Toggle Inlay Hints" })
  end

  -- NOTE: Idk why vim.schedule is needed, but without it, there would be a error sometimes
  -- OUTPUT:
  -- vim.schedule callback: .../vim/diagnostic.lua:659: Invalid 'id': Expected Lua number
  -- stack traceback:
  --         [C]: in function 'nvim_buf_get_extmark_by_id'
  --         .../vim/diagnostic.lua:659: in function 'get_logical_pos'
  --         .../vim/diagnostic.lua:683: in function 'diagnostic_lines'
  --         .../vim/diagnostic.lua:1855: in function 'fn'
  --         .../vim/diagnostic.lua:1655: in function 'fn'
  --         .../vim/diagnostic.lua:1276: in function 'once_buf_loaded'
  --         .../vim/diagnostic.lua:1652: in function 'show_once_loaded'
  --         .../vim/diagnostic.lua:1829: in function 'show'
  --         .../vim/diagnostic.lua:2324: in function 'show'
  --         .../vim/lsp/client.lua:1085>
  vim.schedule(function()
    vim.diagnostic.config({
      signs = {
        text = {
          [vim.diagnostic.severity.ERROR] = icons.diagnostics.ERROR,
          [vim.diagnostic.severity.WARN] = icons.diagnostics.WARN,
          [vim.diagnostic.severity.INFO] = icons.diagnostics.INFO,
          [vim.diagnostic.severity.HINT] = icons.diagnostics.HINT,
        },
      },
      status = {
        text = {
          [vim.diagnostic.severity.ERROR] = icons.diagnostics.ERROR .. " ",
          [vim.diagnostic.severity.WARN] = icons.diagnostics.WARN .. " ",
          [vim.diagnostic.severity.INFO] = icons.diagnostics.INFO .. " ",
          [vim.diagnostic.severity.HINT] = icons.diagnostics.HINT .. " ",
        },
      },
      virtual_text = {
        spacing = 2,
        -- source = true,
        prefix = "󰊠",
      },
      float = {
        spacing = 2,
        source = true,
      },
    })

    local origin_virtual_text_handler = vim.diagnostic.handlers.virtual_text
    vim.diagnostic.handlers.virtual_text = {
      show = function(ns, buf, diagnostics, opts)
        table.sort(diagnostics, function(a, b)
          return a.severity > b.severity
        end)
        if type(origin_virtual_text_handler.show) ~= "function" then
          vim.notify("No origin virtual text handler", vim.log.levels.WARN)
          return
        end
        return origin_virtual_text_handler.show(ns, buf, diagnostics, opts)
      end,
      hide = origin_virtual_text_handler.hide,
    }
  end)
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

vim.api.nvim_create_autocmd({ "BufReadPre", "BufNewFile" }, {
  once = true,
  callback = function()
    local servers = vim
      .iter(vim.api.nvim_get_runtime_file("lsp/*.lua", true))
      :map(function(file)
        return vim.fn.fnamemodify(file, ":t:r")
      end)
      :totable()
    servers = vim.tbl_filter(function(server)
      return server ~= "vtsls"
    end, servers)
    vim.lsp.enable(servers)
  end,
})

function Check_capabilities(id)
  local client = vim.lsp.get_client_by_id(id)
  if not client then
    return
  end
  local methods = {
    "callHierarchy/incomingCalls",
    "callHierarchy/outgoingCalls",
    "codeAction/resolve",
    "codeLens/resolve",
    "completionItem/resolve",
    "documentLink/resolve",
    "initialize",
    "inlayHint/resolve",
    "shutdown",
    "textDocument/codeAction",
    "textDocument/codeLens",
    "textDocument/colorPresentation",
    "textDocument/completion",
    "textDocument/declaration",
    "textDocument/definition",
    "textDocument/diagnostic",
    "textDocument/documentColor",
    "textDocument/documentHighlight",
    "textDocument/documentLink",
    "textDocument/documentSymbol",
    "textDocument/foldingRange",
    "textDocument/formatting",
    "textDocument/hover",
    "textDocument/implementation",
    "textDocument/inlayHint",
    "textDocument/inlineCompletion",
    "textDocument/inlineValue",
    "textDocument/linkedEditingRange",
    "textDocument/moniker",
    "textDocument/onTypeFormatting",
    "textDocument/prepareCallHierarchy",
    "textDocument/prepareRename",
    "textDocument/prepareTypeHierarchy",
    "textDocument/rangeFormatting",
    "textDocument/rangesFormatting",
    "textDocument/references",
    "textDocument/rename",
    "textDocument/selectionRange",
    "textDocument/semanticTokens/full",
    "textDocument/semanticTokens/full/delta",
    "textDocument/semanticTokens/range",
    "textDocument/signatureHelp",
    "textDocument/typeDefinition",
    "textDocument/willSaveWaitUntil",
    "typeHierarchy/subtypes",
    "typeHierarchy/supertypes",
    "workspaceSymbol/resolve",
    "workspace/diagnostic",
    "workspace/executeCommand",
    "workspace/symbol",
    "workspace/textDocumentContent",
    "workspace/willCreateFiles",
    "workspace/willDeleteFiles",
    "workspace/willRenameFiles",
  }
  local supported = {}
  local unsupported = {}
  for _, method in pairs(methods) do
    if client:supports_method(method) then
      table.insert(supported, method)
    else
      table.insert(unsupported, method)
    end
  end
  print("Supported methods for " .. client.name .. ":")
  print(vim.inspect(supported))
  print("Unsupported methods for " .. client.name .. ":")
  print(vim.inspect(unsupported))
end
