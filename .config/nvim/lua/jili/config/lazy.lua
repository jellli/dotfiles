local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
	local lazyrepo = "https://github.com/folke/lazy.nvim.git"
	local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
	if vim.v.shell_error ~= 0 then
		error("Error cloning lazy.nvim:\n" .. out)
	end
end
vim.opt.rtp:prepend(lazypath)
require("lazy").setup({
	require("jili.plugins.autocmp"),
	require("jili.plugins.blankline"),
	require("jili.plugins.color-scheme"),
	require("jili.plugins.comment"),
	require("jili.plugins.neocodeium"),
	require("jili.plugins.formatter"),
	require("jili.plugins.gitsigns"),
	require("jili.plugins.lazygit"),
	require("jili.plugins.lsp"),
	require("jili.plugins.lua-line"),
	require("jili.plugins.mini"),
	require("jili.plugins.misc"),
	require("jili.plugins.neo-tree"),
	require("jili.plugins.nvim-ufo"),
	require("jili.plugins.telescope"),
	require("jili.plugins.treesitter"),
	require("jili.plugins.typescript-tools"),
	require("jili.plugins.vim-tmux-navigator"),
	require("jili.plugins.which-key"),
	checker = { enabled = true },
})
