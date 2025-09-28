vim.g.mapleader = " "
vim.g.maplocalleader = " "

local opt = vim.opt
vim.schedule(function()
  opt.clipboard = "unnamedplus"
end)

opt.number = true
opt.rnu = true

opt.ignorecase = true
opt.smartcase = true -- Don't ignore case with capitals

opt.signcolumn = "yes"

opt.updatetime = 200

opt.timeoutlen = 300

opt.cursorline = true
opt.cursorlineopt = "number"

opt.scrolloff = 8

opt.confirm = true

opt.linebreak = true
opt.smartindent = true -- Insert indents automatically

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
opt.winborder = "rounded"

vim.o.foldenable = true -- enable fold
vim.o.foldlevel = 99 -- start editing with all folds opened
vim.o.foldmethod = "expr" -- use tree-sitter for folding method
vim.o.foldexpr = "v:lua.vim.treesitter.foldexpr()"
vim.o.indentexpr = "v:lua.LazyVim.treesitter.indentexpr()"

opt.undofile = true
opt.undolevels = 10000

opt.swapfile = false
