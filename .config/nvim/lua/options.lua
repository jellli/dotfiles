vim.g.mapleader = " "
vim.g.maplocalleader = " "
vim.g.border = "single"

vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
vim.g.loaded_gzip = 1
vim.g.loaded_rplugin = 1
vim.g.loaded_tarPlugin = 1
vim.g.loaded_tohtml = 1
vim.g.loaded_tutor = 1
vim.g.loaded_zipPlugin = 1

local o = vim.o
local opt = vim.opt

-- 2. moving around, searching and patterns
o.ignorecase = true
o.smartcase = true

-- 4. displaying text
o.scrolloff = 10
o.wrap = false
o.breakindent = true

o.cmdheight = 0

o.number = true
o.relativenumber = true

o.list = true
opt.listchars = { tab = "» ", trail = "·", nbsp = "␣" }

-- 5. syntax, highlighting and spelling
o.termguicolors = true
o.cursorline = true
-- o.spell = true
-- o.spelllang = "en_us,cjk"

-- 6. multiple windows
o.splitright = true
o.splitbelow = true
o.winborder = vim.g.border

-- 9. mouse use
o.mouse = "a"

-- 11
o.showmode = false

-- 12
o.clipboard = "unnamedplus"
o.confirm = true

-- 13
o.undolevels = 100
o.undofile = true
o.nrformats = "unsigned"

-- 14
o.tabstop = 2
o.shiftwidth = 2
o.expandtab = true
o.autoindent = true
o.smartindent = true
-- o.indentexpr = "v:lua.vim.tr

-- 15
o.foldenable = true
o.foldlevel = 100

-- 17
-- o.timeoutlen = 500

-- 18
o.autoread = true

-- 19
o.swapfile = false
o.updatetime = 250

-- 26
o.signcolumn = "yes"
