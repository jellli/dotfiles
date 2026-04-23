vim.pack.add({
  {
    src = 'https://github.com/vieitesss/miniharp.nvim',
    version = vim.version.range("v*"),
  }
})

local miniharp = require('miniharp')
miniharp.setup({
  autoload = true,
  autosave = true, 
  show_on_autoload = false,
  ui = {
    position = 'top-right',
    show_hints = false,
    enter = false,
  },
})

local keymap = Jili.keymap
keymap('n', '<leader>ma', miniharp.toggle_file, 'miniharp: toggle file mark')
keymap('n', '<C-n>',     miniharp.next,        'miniharp: toggle file mark')
keymap('n', '<C-p>',     miniharp.prev,        'miniharp: toggle file mark')
keymap('n', '<leader>ml', miniharp.show_list,   'miniharp: toggle file mark')
keymap('n', '<leader>mL', miniharp.enter_list,  'miniharp: toggle file mark')

keymap('n', '<leader>1', function() miniharp.go_to(1) end, 'miniharp: toggle file mark')
keymap('n', '<leader>2', function() miniharp.go_to(2) end, 'miniharp: toggle file mark')
keymap('n', '<leader>3', function() miniharp.go_to(3) end, 'miniharp: toggle file mark')
keymap('n', '<leader>4', function() miniharp.go_to(4) end, 'miniharp: toggle file mark')
