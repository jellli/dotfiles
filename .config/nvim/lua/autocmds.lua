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
    "gitsigns-blame",
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

local uv = vim.uv

vim.api.nvim_create_autocmd({ "VimEnter", "VimLeave" }, {
  callback = function()
    vim.system({ "tmux", "rename-window", vim.fn.fnamemodify(vim.fn.getcwd(), ":p:h:t") })
  end,
})
