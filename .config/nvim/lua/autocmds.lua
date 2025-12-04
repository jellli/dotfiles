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
      vim.keymap.set("n", "q", ":q<cr>", { silent = true, desc = "Quit buffer", buffer = event.buf })
      return
    end
    if vim.bo.buftype == "codecompanion" then
      vim.keymap.set("n", "q", function()
        require("codecompanion").toggle()
      end, { silent = true, desc = "Quit buffer", buffer = event.buf })
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
    if vim.fn.executable("tmux") == 1 then
      vim.system({ "tmux", "rename-window", vim.fn.fnamemodify(vim.fn.getcwd(), ":p:h:t") })
    end
  end,
})

local function get_os()
  if vim.fn.has("macunix") == 1 then
    return "macOS"
  elseif vim.fn.has("win32") == 1 then
    return "Windows"
  elseif vim.fn.has("wsl") == 1 then
    return "WSL"
  else
    return "Linux"
  end
end

local function get_switch_cmd()
  local os = get_os()
  local cmd = {
    lhs = {},
    rhs = {},
  }

  if os == "macOS" then
    table.insert(cmd.lhs, "macism")
    table.insert(cmd.rhs, "com.apple.keylayout.ABC")
  elseif os == "Windows" or os == "WSL" then
    table.insert(cmd.lhs, "im-select.exe")
    table.insert(cmd.rhs, "1033")
  else
    if vim.fn.executable("fcitx5-remote") then
      table.insert(cmd.lhs, "fcitx5-remote")
      table.insert(cmd.rhs, "-s")
      table.insert(cmd.rhs, "keyboard-us")
    else
      return
    end
  end
  return cmd
end
vim.api.nvim_create_autocmd({ "InsertLeave", "CmdlineLeave", "FocusGained" }, {
  group = vim.api.nvim_create_augroup("auto_switch_input_method", { clear = true }),
  callback = function()
    local cmd = get_switch_cmd()
    if not cmd then
      vim.notify("No supported input method executable found for your OS.", vim.log.levels.WARN)
      return
    end

    local handle
    ---@diagnostic disable-next-line: missing-fields
    handle = uv.spawn(cmd.lhs[1], { args = cmd.rhs }, function(code)
      if handle and not handle:is_closing() then
        handle:close()
      end
      if code ~= 0 then
        vim.notify("Input method switch failed (process exited with non-zero code).", vim.log.levels.WARN)
      end
    end)
  end,
})
