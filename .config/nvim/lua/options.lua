vim.g.mapleader = " "
vim.g.maplocalleader = " "

local opt = vim.opt
opt.clipboard = "unnamedplus"
opt.number = true
opt.rnu = true
opt.linebreak = true
opt.ignorecase = true
opt.smartcase = true -- Don't ignore case with capitals
opt.smartindent = true -- Insert indents automatically
opt.smoothscroll = true
opt.tabstop = 2
opt.expandtab = true
opt.wrap = false
opt.termguicolors = true

opt.fillchars = {
	foldopen = "",
	foldclose = "",
	fold = " ",
	foldsep = " ",
	diff = "╱",
	eob = " ",
}

opt.splitbelow = true
opt.splitright = true

opt.showmode = false
-- opt.swapfile = false
opt.signcolumn = "yes"
opt.winborder = "rounded"

vim.o.foldenable = true -- enable fold
vim.o.foldlevel = 99 -- start editing with all folds opened
vim.o.foldmethod = "expr" -- use tree-sitter for folding method
vim.o.foldexpr = "v:lua.vim.treesitter.foldexpr()"

opt.undofile = true
opt.undolevels = 10000
opt.updatetime = 200
