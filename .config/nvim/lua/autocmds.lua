local utils = require("utils")
--[[ vim.api.nvim_create_autocmd("TextYankPost", {
  callback = function()
    vim.highlight.on_yank()
  end,
  group = utils.creat_group("YankHighlight"),
  pattern = "*",
}) ]]

vim.api.nvim_create_autocmd("FileType", {
  group = utils.creat_group("CloseWithQ"),
  pattern = { "checkhealth", "grug-far", "help", "lspinfo", "qf", "DiffviewFiles" },
  callback = function(event)
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
    local fzf = require("fzf-lua")
    -- LSP
    -- Disable defaults
    pcall(vim.keymap.del, "n", "gra")
    pcall(vim.keymap.del, "n", "gri")
    pcall(vim.keymap.del, "n", "grn")
    pcall(vim.keymap.del, "n", "grr")
    pcall(vim.keymap.del, "n", "grt")

    local lsp_opts = {
      jump1 = true,
      winopts = {
        width = 0.80,
        preview = {
          layout = "horizontal",
          hidden = false,
        },
      },
    }
    -- utils.map("<leader>rn", function()
    -- 	vim.lsp.buf.rename()
    -- end, { desc = "Rename" })
    utils.map("gd", function()
      fzf.lsp_definitions(lsp_opts)
    end, { desc = "Goto Definition" })
    utils.map("gr", function()
      fzf.lsp_references(lsp_opts)
    end, { desc = "Goto Reference" })
    utils.map("gt", function()
      fzf.lsp_typedefs(lsp_opts)
    end, { desc = "Goto Type Definition" })
    utils.map("gI", function()
      fzf.lsp_implementations(lsp_opts)
    end, { desc = "Goto Implementation" })

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
