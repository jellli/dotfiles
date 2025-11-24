local utils = require("utils")
-- vim.api.nvim_create_autocmd("TextYankPost", {
--   callback = function()
--     vim.highlight.on_yank()
--   end,
--   group = utils.creat_group("YankHighlight"),
--   pattern = "*",
-- })

vim.api.nvim_create_autocmd("FileType", {
  group = utils.creat_group("CloseWithQ"),
  pattern = {
    "checkhealth",
    "grug-far",
    "help",
    "lspinfo",
    "qf",
    "DiffviewFiles",
    "codecompanion",
    "fugitive",
    "git",
    "gitcommit",
  },
  callback = function(event)
    if vim.bo.filetype == "git" or vim.bo.filetype == "gitcommit" then
      vim.keymap.set("n", "q", ":q<cr>", { silent = true, desc = "Quit buffer" })
      return
    end
    if vim.bo.buftype == "codecompanion" then
      vim.keymap.set("n", "q", function()
        require("codecompanion").toggle()
      end, { silent = true, desc = "Quit buffer" })
      return
    end

    vim.bo[event.buf].buflisted = false
    vim.schedule(function()
      vim.keymap.set("n", "q", function()
        vim.cmd("close")
        pcall(vim.api.nvim_buf_delete, event.buf, { force = true })
      end, { buffer = event.buf, silent = true, desc = "Quit buffer" })
    end)
  end,
})

vim.api.nvim_create_autocmd("LspAttach", {
  group = utils.creat_group("lsp-attach"),
  callback = function(event)
    -- LSP
    -- Disable defaults
    pcall(vim.keymap.del, "n", "gra")
    pcall(vim.keymap.del, "n", "gri")
    pcall(vim.keymap.del, "n", "grn")
    pcall(vim.keymap.del, "n", "grr")
    pcall(vim.keymap.del, "n", "grt")

    utils.map("<leader>rn", vim.lsp.buf.rename, { desc = "Rename" })
    -- other keybinds that use bufopts
    utils.map("<space>ca", vim.lsp.buf.code_action, { desc = "Code Actions" })

    ---@param client vim.lsp.Client
    ---@param method vim.lsp.protocol.Method.ClientToServer
    ---@param bufnr? integer some lsp support methods only in specific files
    ---@return boolean
    local function supports_method(client, method, bufnr)
      return client:supports_method(method, bufnr)
    end
    local client = vim.lsp.get_client_by_id(event.data.client_id)

    if client and supports_method(client, vim.lsp.protocol.Methods.textDocument_documentHighlight, event.buf) then
      local highlight_augroup = utils.creat_group("lsp-highlight")
      vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
        buffer = event.buf,
        group = highlight_augroup,
        callback = vim.lsp.buf.document_highlight,
      })

      vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
        buffer = event.buf,
        group = highlight_augroup,
        callback = vim.lsp.buf.clear_references,
      })

      vim.api.nvim_create_autocmd("LspDetach", {
        group = utils.creat_group("lsp-detach"),
        callback = function(detachEvent)
          vim.lsp.buf.clear_references()
          vim.api.nvim_clear_autocmds({ group = highlight_augroup, buffer = detachEvent.buf })
        end,
      })
    end

    utils.map("<leader>th", function()
      if client and supports_method(client, "textDocument/inlayHint", event.buf) then
        vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = event.buf }))
      else
        vim.notify("LSP client does not support inlay hints", vim.log.levels.WARN)
      end
    end, { desc = "Toggle Inlay Hints" })
  end,
})

vim.api.nvim_create_autocmd("FileType", {
  callback = function()
    vim.cmd("setlocal formatoptions-=c formatoptions-=o")
  end,
})

-- show cursor line only in active window
vim.api.nvim_create_autocmd({ "InsertLeave", "WinEnter" }, {
  callback = function()
    if vim.w.auto_cursorline then
      vim.wo.cursorline = true
      vim.w.auto_cursorline = nil
    end
  end,
})
vim.api.nvim_create_autocmd({ "InsertEnter", "WinLeave" }, {
  callback = function()
    if vim.wo.cursorline then
      vim.w.auto_cursorline = true
      vim.wo.cursorline = false
    end
  end,
})
