function Insert_indent()
	local expandtab = vim.o.expandtab
	local tabstop = vim.o.tabstop

	local indent_char
	local indent_size

	if expandtab then
		indent_char = " "
		indent_size = tabstop
	else
		indent_char = "\t"
		indent_size = 1
	end

	vim.api.nvim_input(indent_char:rep(indent_size))
end

return {
	"monkoose/neocodeium",
	event = "VeryLazy",
	config = function()
		local neocodeium = require("neocodeium")
		neocodeium.setup()
		vim.keymap.set("i", "<Tab>", function()
			if neocodeium.visible() then
				neocodeium.accept()
			else
				Insert_indent()
			end
		end)
		vim.keymap.set("i", "<A-w>", function()
			neocodeium.accept_word()
		end)
		vim.keymap.set("i", "<A-l>", function()
			neocodeium.accept_line()
		end)
		vim.keymap.set("i", "<A-c>", function()
			neocodeium.clear()
		end)
	end,
}
