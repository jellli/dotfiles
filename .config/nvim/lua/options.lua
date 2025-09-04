vim.g.mapleader = " "
vim.g.maplocalleader = " "

vim.schedule(function()
	vim.opt.clipboard = "unnamedplus"
end)

local o = vim.opt

o.number = true
o.rnu = true
o.linebreak = true
o.ignorecase = true
o.smartcase = true
o.tabstop = 2
o.wrap = false
o.termguicolors = true

o.splitbelow = true
o.splitright = true

o.showmode = false
o.swapfile = false
o.signcolumn = "yes"
o.winborder = "rounded"

vim.o.foldenable = true -- enable fold
vim.o.foldlevel = 99 -- start editing with all folds opened
vim.o.foldmethod = "expr" -- use tree-sitter for folding method
vim.o.foldexpr = "v:lua.vim.treesitter.foldexpr()"

