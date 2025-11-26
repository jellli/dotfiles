local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)

---@type LazySpec
local plugins = "plugins"

require("options")
require("keymap")
require("autocmds")
require("lsp")
require("lazy").setup(plugins, {
  ui = { border = vim.g.border },
  install = {
    -- Do not automatically install on startup.
    missing = false,
  },
  dev = {
    path = "~/personal/",
  },
  change_detection = { notify = false },
  performance = {
    cache = {
      enabled = true,
    },
    reset_packpath = true, -- 重置包路径以提高性能
    rtp = {
      disabled_plugins = {
        "gzip",
        "matchit",
        "matchparen",
        "netrwPlugin",
        "tarPlugin",
        "tohtml",
        "tutor",
        "zipPlugin",
      },
    },
  },
})
